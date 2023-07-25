// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./IOptiDomainsAttestation.sol";

bytes32 constant VERSION_KEY = keccak256("optidomains.resolver.VersionStorage");

error NotResolver(address caller, address resolver);

library OptiDomainsAttestationStorage {
    struct Layout {
        mapping(EAS => uint256) activationPriority;
        mapping(EAS => uint256) activationChainId;
        EAS eas;

        /**
         * @notice Maps domain to version. Node => Owner => Version.
         */
        mapping(bytes32 => mapping(address => uint64)) versions;

        /**
         * @notice Maps recorded attestation. keccak256(Version, Node, Owner, Schema, Key) => Attestation.
         */
        mapping(bytes32 => bytes32) records;
    }

    bytes32 internal constant STORAGE_SLOT =
        keccak256('optidomains.contracts.storage.OptiDomainsAttestationStorage');

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}

contract OptiDomainsAttestationFacet is IOptiDomainsAttestation {
    INameWrapperRegistry public immutable registry;
    address public immutable activationController;

    constructor(INameWrapperRegistry _registry, address _activationController) {
        registry = _registry;
        activationController = _activationController;
    }

    function eas() external view returns(EAS) {
        return OptiDomainsAttestationStorage.layout().eas;
    }

    function versions(bytes32 node, address owner) external view returns(uint64) {
        return OptiDomainsAttestationStorage.layout().versions[node][owner];
    }

    function records(bytes32 node) external view returns(bytes32) {
        return OptiDomainsAttestationStorage.layout().records[node];
    }

    function isContract(address _addr) private view returns (bool) {
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size > 0);
    }

    struct ActivationRule {
        EAS eas;
        uint256 priority;
        uint256 chainId;
    }

    function _activate(EAS _eas, uint256 _priority, uint256 _chainId) internal {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        require(msg.sender == activationController || (S.activationPriority[_eas] > 0 && S.activationPriority[_eas] == _priority && S.activationChainId[_eas] == _chainId && (block.chainid == _chainId || _chainId == 0)), "Forbidden");

        S.activationPriority[_eas] = _priority;
        S.activationChainId[_eas] = _chainId;

        if (isContract(address(_eas)) && (block.chainid == _chainId || _chainId == 0)) {
            if (S.activationPriority[_eas] > S.activationPriority[S.eas]) {
                S.eas = _eas;
            }
        }
    }

    function activate(ActivationRule[] calldata rules) public {
        unchecked {
            uint256 ruleLength = rules.length;
            for (uint256 i; i < ruleLength; ++i) {
                ActivationRule calldata rule = rules[i];
                _activate(rule.eas, rule.priority, rule.chainId);
            }
        }
    }

    function _buildAttestation(
        address owner,
        bytes32 schema,
        bytes32 ref,
        bytes calldata data
    ) internal pure returns (AttestationRequest memory) {
        return
            AttestationRequest({
                schema: schema,
                data: AttestationRequestData({
                    recipient: owner,
                    expirationTime: 0,
                    revocable: true,
                    refUID: ref,
                    data: data,
                    value: 0
                })
            });
    }

    function buildAttestation(
        bytes32 node,
        bytes32 schema,
        bytes32 ref,
        bool toDomain,
        bytes calldata data
    ) public view returns (AttestationRequest memory) {
        address owner = toDomain
            ? address(uint160(uint256(node)))
            : registry.ownerOf(node);
        return _buildAttestation(owner, schema, ref, data);
    }

    event Revoke(
        bytes32 indexed node,
        bytes32 indexed schema,
        bytes32 indexed key,
        bytes32 uid,
        address owner,
        address origin
    );

    function _revoke(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        address owner
    ) internal {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        bytes32 uid = S.records[
            keccak256(
                abi.encodePacked(
                    S.versions[node][owner],
                    node,
                    owner,
                    schema,
                    key
                )
            )
        ];

        if (uid != 0) {
            S.eas.revoke(
                RevocationRequest({
                    schema: schema,
                    data: RevocationRequestData({uid: uid, value: 0})
                })
            );

            emit Revoke(node, schema, key, uid, owner, tx.origin);
        }
    }

    function revoke(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) public {
        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        address owner = toDomain
            ? address(uint160(uint256(node)))
            : registry.ownerOf(node);

        _revoke(node, schema, key, owner);
    }

    event Attest(
        bytes32 indexed node,
        bytes32 indexed schema,
        bytes32 indexed key,
        bytes32 uid,
        bytes32 ref,
        address owner,
        address resolver,
        address origin,
        bytes data
    );

    function _attest(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        bytes32 node,
        address resolver,
        address owner,
        bytes calldata data
    ) internal {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        bytes32 recordKey = keccak256(
            abi.encodePacked(
                S.versions[node][owner],
                node,
                owner,
                schema,
                key
            )
        );

        {
            bytes32 oldUid = S.records[recordKey];

            if (oldUid != 0) {
                S.eas.revoke(
                    RevocationRequest({
                        schema: schema,
                        data: RevocationRequestData({uid: oldUid, value: 0})
                    })
                );

                emit Revoke(node, schema, key, oldUid, owner, tx.origin);
            }
        }

        {
            bytes32 uid = S.eas.attest(
                _buildAttestation(owner, schema, ref, data)
            );

            S.records[recordKey] = uid;

            emit Attest(node, schema, key, uid, ref, owner, resolver, tx.origin, data);
        }
    }

    function attest(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        bool toDomain,
        bytes calldata data
    ) public {
        bytes32 node = abi.decode(data, (bytes32));

        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        address owner = toDomain
            ? address(uint160(uint256(node)))
            : registry.ownerOf(node);

        _attest(schema, key, ref, node, resolver, owner, data);
    }

    function attest(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        bytes calldata data
    ) public {
        attest(schema, key, ref, false, data);
    }

    function attest(bytes32 schema, bytes32 key, bytes calldata data) public {
        attest(schema, key, bytes32(0), false, data);
    }

    function readRawToOther(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        address target
    ) public view returns (Attestation memory) {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        return
            S.eas.getAttestation(
                S.records[
                    keccak256(
                        abi.encodePacked(
                            S.versions[node][target],
                            node,
                            target,
                            schema,
                            key
                        )
                    )
                ]
            );
    }

    function readRaw(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) public view returns (Attestation memory) {
        address owner = toDomain
            ? address(uint160(uint256(node)))
            : registry.ownerOf(node);
        return readRawToOther(node, schema, key, owner);
    }

    function readRefToOther(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        address target
    ) public view returns (Attestation memory) {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();
        return S.eas.getAttestation(readRawToOther(node, schema, key, target).refUID);
    }

    function readRef(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) public view returns (Attestation memory) {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();
        return S.eas.getAttestation(readRaw(node, schema, key, toDomain).refUID);
    }

    function readToOther(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        address target
    ) public view returns (bytes memory result) {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        Attestation memory a = S.eas.getAttestation(
            S.records[
                keccak256(
                    abi.encodePacked(
                        S.versions[node][target],
                        node,
                        target,
                        schema,
                        key
                    )
                )
            ]
        );

        if (
            a.attester != address(this) ||
            a.recipient != target ||
            a.schema != schema ||
            (a.expirationTime > 0 && a.expirationTime < block.timestamp) ||
            a.revocationTime != 0 ||
            a.data.length <= 32
        ) {
            return "";
        }

        return a.data;
    }

    function read(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) public view returns (bytes memory result) {        
        address owner = toDomain
            ? address(uint160(uint256(node)))
            : registry.ownerOf(node);
        return readToOther(node, schema, key, owner);
    }

    function read(
        bytes32 node,
        bytes32 schema,
        bytes32 key
    ) public view returns (bytes memory) {
        return read(node, schema, key, false);
    }

    // Increase version by resolver
    event IncreaseVersion(
        bytes32 indexed node,
        address indexed owner,
        uint256 version
    );

    function increaseVersion(bytes32 node) public {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();

        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        address owner = registry.ownerOf(node);

        S.versions[node][owner]++;

        emit IncreaseVersion(node, owner, S.versions[node][owner]);
    }

    function readVersion(bytes32 node) public view returns (uint64) {
        OptiDomainsAttestationStorage.Layout storage S = OptiDomainsAttestationStorage.layout();
        address owner = registry.ownerOf(node);
        return S.versions[node][owner];
    }

    function attestToOther(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        address target,
        bytes calldata data
    ) public {
        bytes32 node = abi.decode(data, (bytes32));

        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        _attest(schema, key, ref, node, resolver, target, data);
    }

    function revokeToOther(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        address target
    ) public {
        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        _revoke(node, schema, key, target);
    }


}
