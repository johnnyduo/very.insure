// SPDX-License-Identifier: MIT

pragma solidity ^0.8.8;

interface IDiamondResolverFactory {
  function clone(bytes32 salt) external;
}