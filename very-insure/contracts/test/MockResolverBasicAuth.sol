pragma solidity ^0.8.4;

import "./AddrResolver.sol";
import "./NameResolver.sol";
import "../interfaces/IDiamondResolverAuth.sol";

contract MockResolverBasicAuth is IDiamondResolverAuth, AddrResolver, NameResolver {
    mapping(bytes32 => mapping(address => bool)) private _isAuthorised;

    function isAuthorised(
        bytes32 node
    ) internal view virtual override returns (bool) {
        return _isAuthorised[node][msg.sender];
    }

    function isAuthorised(address sender, bytes32 node) public view returns (bool) {
        return _isAuthorised[node][sender];
    }

    function setAuthorised(
        bytes32 node,
        address user,
        bool authorised
    ) public {
        _isAuthorised[node][user] = authorised;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(AddrResolver, NameResolver) returns (bool) {
        return interfaceID == type(IDiamondResolverAuth).interfaceId || super.supportsInterface(interfaceID);
    }
}
