//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

interface IKycResolver {
    event KycProvided(bytes32 indexed node, bytes32 indexed provider, bytes32 indexed identity, bytes32 ref, uint256 expiration);

    function kyc(
        bytes32 node,
        bytes32 provider
    ) external view returns (bytes32 ref, bytes32 identity, uint256 expiration);

    function provideKyc(bytes32 node, bytes32 provider, bytes32 ref) external;
}
