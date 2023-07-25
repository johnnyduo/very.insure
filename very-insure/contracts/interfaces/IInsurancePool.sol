//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/interfaces/IERC4626.sol";

import "./IInsuranceMasterchef.sol";
import "./IInsuranceRegistrar.sol";
import "./IArbitrableProxy.sol";

interface IInsurancePool is IERC20, IERC4626 {
    function expiration() external view returns (uint256);

    function withdrawalFee() external view returns (uint256);

    function instantReward() external view returns (uint256);

    function masterchef() external view returns (IInsuranceMasterchef);

    function registrar() external view returns (IInsuranceRegistrar);

    function ownerNode() external view returns (bytes32);

    function distribute(uint256 amount) external;

    function conclude() external;

    struct ClaimInformation {
        bytes32 node;
        uint256 claimId;
        address recipient;
        uint256 amount;
        address approver;
        uint256 disputeId; // External ID
        uint256 approvedAt;
        bytes data;
        bytes arbitratorExtraData;
        string metaEvidenceURI;
    }

    function claims(bytes32 node, uint256 claimId) external view returns(ClaimInformation memory);

    function claimWithArbitration(
        bytes32 node,
        address recipient,
        uint256 amount,
        IArbitrableProxy proxy,
        bytes calldata data,
        bytes calldata arbitratorExtraData,
        string calldata metaEvidenceURI
    ) external payable returns(uint256);

    function claimFinalize(bytes32 node, uint256 claimId) external;

    function claimWithSignature(
        bytes32 node,
        address recipient,
        uint256 amount,
        address operator,
        uint256 nonce,
        uint256 deadline,
        bytes calldata data,
        bytes calldata signature
    ) external;
}
