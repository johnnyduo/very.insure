pragma solidity ^0.8.4;

import "./AddrResolver.sol";
import "./NameResolver.sol";
import "../interfaces/IDiamondResolverAuth.sol";

contract MockResolverNoAuth {
    function supportsInterface(
        bytes4
    ) public view virtual returns (bool) {
        return false;
    }
}
