//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../interfaces/INameWrapperRegistry.sol";

import "../InsuranceOwnershipToken.sol";
import "../InsurancePool.sol";
import "../InsuranceMasterchef.sol";

interface IInsuranceRegistrar {
    function registry() external view returns (INameWrapperRegistry);

    struct PoolInformation {
        bytes32 owner;
        InsurancePool pool;
        InsuranceMasterchef masterchef;
        InsuranceOwnershipToken ownershipToken;
        uint256 factoryFee;
        uint256 factoryMaxFee;
        uint256 ownerShare;
    }
    function poolInformation(bytes32 node) external view returns(PoolInformation memory);
    function nodePool(bytes32 node) external view returns(InsurancePool);

    struct InsuranceInformation {
        bytes32 node;
        bytes32 pool;
        uint256 price;
        uint256 expiration;
        address approver;
        uint256 disputeId; // External ID
        uint256 approvedAt;
        bytes data;
        bytes arbitratorExtraData;
        string metaEvidenceURI;
    }
    function insurances(bytes32 node) external view returns(InsuranceInformation memory);

    function isAuthorised(
        address sender,
        bytes32 node,
        bytes32 role
    ) external view returns (bool);

    // =================================================
    // POOL DEPLOYMENT
    // =================================================

    function deployPool(
        bytes32 node,
        IERC20 asset,
        uint256 expiration,
        uint256 ownerShare,
        uint256 withdrawalFee,
        uint256 instantReward,
        string memory name,
        string memory symbol
    ) external;

    // =================================================
    // FACTORY FEE MANAGEMENT
    // =================================================

    function adjustFactoryFee(
        bytes32 node,
        uint256 _factoryFee
    ) external;

    function increaseMaxFactoryFee(
        bytes32 node,
        uint256 _maxFactoryFee
    ) external;

    function decreaseMaxFactoryFee(
        bytes32 node,
        uint256 _maxFactoryFee
    ) external;

    // =================================================
    // ARBITRATION MANAGEMENT
    // =================================================

    function trustedArbitrableProxies(
        bytes32 node,
        address proxy
    ) external view returns (bool);

    function setTrustedArbitrableProxy(
        bytes32 node,
        address proxy,
        bool trusted
    ) external;

    function isTrustedProxy(
        bytes32 _node,
        IArbitrableProxy _proxy
    ) external view returns (bool);

    // =================================================
    // BUY INSURANCE
    // =================================================

    function buyInsuranceWithArbitration(
        bytes32 node,
        bytes32 pool,
        uint256 price,
        uint256 expiration,
        IArbitrableProxy proxy,
        bytes calldata data,
        bytes calldata arbitratorExtraData,
        string calldata metaEvidenceURI
    ) external payable;

    function buyInsuranceFinalize(bytes32 node) external;

    function buyInsuranceWithSignature(
        bytes32 node,
        bytes32 pool,
        uint256 price,
        uint256 expiration,
        address operator,
        uint256 nonce,
        uint256 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external;
}
