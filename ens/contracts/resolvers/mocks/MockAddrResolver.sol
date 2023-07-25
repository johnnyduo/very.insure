pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../profiles/AddrResolver.sol";
import "../profiles/NameResolver.sol";

contract MockAddrResolver is AddrResolver, NameResolver, Ownable {
    function isAuthorised(
        bytes32 node
    ) internal view virtual override returns (bool) {
        return true;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(AddrResolver, NameResolver) returns (bool) {
        return super.supportsInterface(interfaceID);
    }
}
