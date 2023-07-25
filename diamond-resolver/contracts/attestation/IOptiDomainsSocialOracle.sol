// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface IOptiDomainsSocialOracle {
    function attest(
        bytes32 schema,
        bytes calldata data,
        bytes calldata operatorSignature
    ) external returns(bytes32);

    function revoke(bytes32 schema, bytes32 uid, bytes calldata operatorSignature) external;
}
