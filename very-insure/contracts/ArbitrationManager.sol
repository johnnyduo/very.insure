pragma solidity ^0.8.19;

import "./interfaces/IArbitrableProxy.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

import {ArbitrableProxy} from "./test/ArbitrableProxy.sol";

error ArbitrableProxyNotTrusted(address proxy);
error DisputeNotExecutable(IArbitrableProxy _proxy, uint256 _externalId);
error SignatureExpired();
error InvalidSignature();

bytes32 constant EXECUTE_DISPUTE_WITH_SIG_TYPEHASH = keccak256(
    "ExecuteDisputeWithSig(bytes32 node,bytes32 digest,uint256 nonce,uint256 deadline)"
);

abstract contract ArbitrationManager is EIP712 {
    function isTrustedProxy(
        bytes32 _node,
        IArbitrableProxy _proxy
    ) public view virtual returns (bool);

    modifier trustedProxy(bytes32 _node, IArbitrableProxy _proxy) {
        if (!isTrustedProxy(_node, _proxy)) {
            revert ArbitrableProxyNotTrusted(address(_proxy));
        }
        _;
    }

    mapping(address => mapping(uint256 => bool))
        private isDisputeExecuted;

    event CreateDispute(
        address indexed proxy,
        uint256 indexed externalId,
        uint256 indexed localId,
        bytes arbitratorExtraData,
        string metaEvidenceURI
    );

    function createDispute(
        bytes32 _node,
        IArbitrableProxy _proxy,
        bytes calldata _arbitratorExtraData,
        string calldata _metaEvidenceURI
    ) internal trustedProxy(_node, _proxy) returns (uint256 externalId) {
        externalId = _proxy.createDispute{value: msg.value}(
            _arbitratorExtraData,
            _metaEvidenceURI,
            2
        );
        uint256 localId = _proxy.externalIDtoLocalID(externalId);
        emit CreateDispute(
            address(_proxy),
            externalId,
            localId,
            _arbitratorExtraData,
            _metaEvidenceURI
        );
    }

    // This function will used to determine if we can take action of the particular
    function isDisputeExecutable(
        bytes32 _node,
        IArbitrableProxy _proxy,
        uint256 _externalId
    ) public view returns (bool) {
        if (!isTrustedProxy(_node, _proxy) || isDisputeExecuted[address(_proxy)][_externalId]) {
            return false;
        }

        uint256 localId = _proxy.externalIDtoLocalID(_externalId);

        (, bool isRuled, uint256 ruling, ) = _proxy.disputes(
            localId
        );

        return isRuled && ruling == 1;
    }

    event DisputeExecuted(IArbitrableProxy _proxy, uint256 _externalId);

    function markDisputeExecuted(
        address _proxy,
        uint256 _externalId
    ) internal {
        isDisputeExecuted[_proxy][_externalId] = true;
    }

    modifier executeDispute(bytes32 _node, IArbitrableProxy _proxy, uint256 _externalId) {
        if (!isDisputeExecutable(_node, _proxy, _externalId)) {
            revert DisputeNotExecutable(_proxy, _externalId);
        }
        _;
        markDisputeExecuted(address(_proxy), _externalId);
    }

    modifier executeDisputeWithSig(
        bytes32 _node,
        address _proxy,
        uint256 _nonce,
        uint256 _deadline,
        bytes32 _digest,
        bytes calldata _signature
    ) {
        if (_deadline < block.timestamp) {
            revert SignatureExpired();
        }

        bytes32 structHash = keccak256(
            abi.encode(
                EXECUTE_DISPUTE_WITH_SIG_TYPEHASH,
                _node,
                _digest,
                _nonce,
                _deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(_proxy, digest, _signature)) {
            revert InvalidSignature();
        }

        _;
        markDisputeExecuted(_proxy, _nonce);
    }
}
