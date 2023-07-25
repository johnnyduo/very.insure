//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IInsuranceRoleResolver {
    function isAuthorised(
        address sender,
        bytes32 node,
        bytes32 role
    ) external view returns (bool);
}
