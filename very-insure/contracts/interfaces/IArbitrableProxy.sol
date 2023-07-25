pragma solidity ^0.8.19;

import "./IDisputeResolver.sol";

interface IArbitrableProxy is IDisputeResolver {
    struct DisputeStruct {
        bytes arbitratorExtraData;
        bool isRuled;
        uint256 ruling;
        uint256 disputeIDOnArbitratorSide;
    }

    function disputes(uint256 index) external view returns(
        bytes memory arbitratorExtraData,
        bool isRuled,
        uint256 ruling,
        uint256 disputeIDOnArbitratorSide
    );
    function externalIDtoLocalID(uint256 externalId) external view override returns(uint256);

    function createDispute(
        bytes calldata _arbitratorExtraData,
        string calldata _metaevidenceURI,
        uint256 _numberOfRulingOptions
    ) external payable returns (uint256 disputeID);
}
