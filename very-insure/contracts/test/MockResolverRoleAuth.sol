pragma solidity ^0.8.4;

import "./AddrResolver.sol";
import "./NameResolver.sol";
import "../interfaces/IDiamondResolverAuth.sol";
import "../interfaces/IInsuranceRoleResolver.sol";

bytes32 constant ROLE_DEPLOY_POOL = keccak256("veryinsure.roles.DeployPool");

contract MockResolverRoleAuth is IDiamondResolverAuth, IInsuranceRoleResolver, AddrResolver, NameResolver {
    mapping(bytes32 => mapping(address => bool)) private _isAuthorised;
    mapping(bytes32 => mapping(address => bool)) private _isAllowDeployPool;
    mapping(bytes32 => mapping(address => bool)) private _isAllowOther;

    function isAuthorised(
        address sender,
        bytes32 node,
        bytes32 role
    ) external view returns (bool) {
        if (_isAllowOther[node][sender]) {
            return _isAuthorised[node][sender];
        } else {
            if (role == ROLE_DEPLOY_POOL && _isAllowDeployPool[node][sender]) {
                return _isAuthorised[node][sender];
            } else {
                return false;
            }
        }
    }

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
        bool authorised,
        bool deployPool,
        bool other
    ) public {
        _isAuthorised[node][user] = authorised;
        _isAllowDeployPool[node][user] = deployPool;
        _isAllowOther[node][user] = other;
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(AddrResolver, NameResolver) returns (bool) {
        return interfaceID == type(IInsuranceRoleResolver).interfaceId || interfaceID == type(IDiamondResolverAuth).interfaceId || super.supportsInterface(interfaceID);
    }
}
