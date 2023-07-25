// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {INameWrapperRegistry} from "../diamond-resolver/INameWrapperRegistry.sol";
import "./AttestationStation.sol";

bytes32 constant VERSION_KEY = keccak256("optidomains.resolver.VersionStorage");

error NotResolver(address caller, address resolver);

contract OptiDomainsAttestationV0 {
    INameWrapperRegistry public immutable registry;
    AttestationStation public immutable attestationStation;
    bool public attestationActivated;

    // In case attestation is not created -> simulate it in this contract

    /**
     * @notice Maps addresses to attestations. Creator => About => Key => Value.
     */
    mapping(address => mapping(address => mapping(bytes32 => bytes)))
        public attestations;

    /**
     * @notice Emitted when Attestation is created.
     *
     * @param creator Address that made the attestation.
     * @param about   Address attestation is about.
     * @param key     Key of the attestation.
     * @param val     Value of the attestation.
     */
    event AttestationCreated(
        address indexed creator,
        address indexed about,
        bytes32 indexed key,
        bytes val
    );

    function _attestLocal(address _about, bytes32 _key, bytes memory _val) internal {
        attestations[address(this)][_about][_key] = _val;
        emit AttestationCreated(address(this), _about, _key, _val);
    }

    function isContract(address _addr) private view returns (bool) {
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        return (size > 0);
    }

    constructor(
        INameWrapperRegistry _registry,
        AttestationStation _attestationStation
    ) {
        registry = _registry;
        attestationStation = _attestationStation;
        attestationActivated = isContract(address(_attestationStation));
    }

    function activate() public {
        attestationActivated = isContract(address(attestationStation));
    }

    function _attest(AttestationStation.AttestationData[] memory _attestations) internal {
        if (attestationActivated) {
            attestationStation.attest(_attestations);
        } else {
            uint256 length = _attestations.length;
            for (uint256 i = 0; i < length; ) {
                AttestationStation.AttestationData memory attestation = _attestations[i];

                _attestLocal(attestation.about, attestation.key, attestation.val);

                unchecked {
                    ++i;
                }
            }
        }
    }

    function _readAttestation(address creator, address about, bytes32 key) public view returns(bytes memory) {
        if (attestationActivated) {
            return attestationStation.attestations(creator, about, key);
        } else {
            return attestations[creator][about][key];
        }
    }

    function _readVersion(address owner, bytes32 node) internal view returns(uint64) {
        bytes memory response = _readAttestation(address(this), owner, keccak256(abi.encodePacked(node, VERSION_KEY)));
        if (response.length == 0) return 0;
        return abi.decode(response, (uint64));
    }

    function readVersion(bytes32 node) public view returns(uint64) {
        return _readVersion(registry.ownerOf(node), node);
    }

    function readAttestation(address creator, bytes32 node, bytes32 key) public view returns(bytes memory) {
        address owner = registry.ownerOf(node);
        uint64 version = _readVersion(owner, node);
        return _readAttestation(creator, owner, keccak256(abi.encodePacked(node, key, version)));
    }

    function readAttestation(bytes32 node, bytes32 key) public view returns(bytes memory) {
        return readAttestation(address(this), node, key);
    }

    function readAttestationNV(address creator, bytes32 node, bytes32 key) public view returns(bytes memory) {
        address owner = registry.ownerOf(node);
        return _readAttestation(creator, owner, keccak256(abi.encodePacked(node, key)));
    }

    // External attestor
    function buildAttestationData(bytes32 node, bytes32 key, uint256 flags, bytes memory value) public view returns(AttestationStation.AttestationData[] memory att) {
        address owner = registry.ownerOf(node);

        require(flags > 0 && flags < 8, "Invalid flags");

        bool useOwner = (flags & 1) > 0;
        bool useVersion = (flags & 2) > 0;
        bool useNodeOnly = (flags % 4) > 0;

        uint256 length;

        assembly {
            // SAFETY: Simple bool-to-int cast.
            length := add(add(useOwner, useVersion), useNodeOnly)
        }
        
        att = new AttestationStation.AttestationData[](length);

        uint256 i = 0;

        if (useOwner) {
            att[i++] = AttestationStation.AttestationData({
                about: owner,
                key: keccak256(abi.encodePacked(node, key)),
                val: value
            });
        }

        if (useVersion) {
            uint64 version = _readVersion(owner, node);

            att[i++] = AttestationStation.AttestationData({
                about: owner,
                key: keccak256(abi.encodePacked(node, key, version)),
                val: value
            });
        }

        if (useNodeOnly) {
            att[i++] = AttestationStation.AttestationData({
                about: address(0),
                key: keccak256(abi.encodePacked(node, key)),
                val: value
            });
        }
    }

    // Attest by resolver
    function attest(bytes32 node, bytes32 key, bytes memory value) public {
        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        address owner = registry.ownerOf(node);
        uint64 version = _readVersion(owner, node);

        // AttestationStation.AttestationData[] memory att = buildAttestationData(node, key, 3, value);

        AttestationStation.AttestationData[] memory att = new AttestationStation.AttestationData[](2);
        
        att[0] = AttestationStation.AttestationData({
            about: owner,
            key: keccak256(abi.encodePacked(node, key)),
            val: value
        });

        att[1] = AttestationStation.AttestationData({
            about: owner,
            key: keccak256(abi.encodePacked(node, key, version)),
            val: value
        });

        _attest(att);
    }

    // Increase version by resolver
    function increaseVersion(bytes32 node) public {
        address resolver = registry.ens().resolver(node);
        if (msg.sender != resolver) {
            revert NotResolver(msg.sender, resolver);
        }

        address owner = registry.ownerOf(node);
        uint64 version = _readVersion(owner, node);

        AttestationStation.AttestationData[] memory att = new AttestationStation.AttestationData[](1);
        
        att[0] = AttestationStation.AttestationData({
            about: owner,
            key: keccak256(abi.encodePacked(node, VERSION_KEY)),
            val: abi.encode(version + 1)
        });

        _attest(att);
    }
}
