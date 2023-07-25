// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import {INameWrapperRegistry} from "../diamond-resolver/INameWrapperRegistry.sol";
import "./eas/EAS.sol";

interface IOptiDomainsAttestation {
    function registry() external view returns(INameWrapperRegistry);
    function activationController() external view returns(address);
    function eas() external view returns(EAS);
    function versions(bytes32 node, address owner) external view returns(uint64);
    function records(bytes32 node) external view returns(bytes32);

    function buildAttestation(
        bytes32 node,
        bytes32 schema,
        bytes32 ref,
        bool toDomain,
        bytes calldata data
    ) external view returns (AttestationRequest memory);

    function revoke(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) external;

    function attest(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        bool toDomain,
        bytes calldata data
    ) external;

    function attest(
        bytes32 schema,
        bytes32 key,
        bytes32 ref,
        bytes calldata data
    ) external;

    function attest(bytes32 schema, bytes32 key, bytes calldata data) external;

    function readRaw(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) external view returns (Attestation memory);

    function readRef(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) external view returns (Attestation memory);

    function read(
        bytes32 node,
        bytes32 schema,
        bytes32 key,
        bool toDomain
    ) external view returns (bytes memory result);

    function read(
        bytes32 node,
        bytes32 schema,
        bytes32 key
    ) external view returns (bytes memory);

    function increaseVersion(bytes32 node) external;

    function readVersion(bytes32 node) external view returns (uint64); 
}
