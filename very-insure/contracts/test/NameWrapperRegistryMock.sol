//SPDX-License-Identifier: MIT
pragma solidity >=0.8.17 <0.9.0;

import "../interfaces/ENS.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

// Mock Just For Test
contract NameWrapperRegistryMock is Ownable, IERC165 {
    ENS public immutable ens;
    address public attestation;
    mapping(address => bool) public isNameWrapper;
    mapping(address => address) public forward;
    mapping(address => address) public backward;

    constructor(ENS _ens) Ownable(msg.sender) {
        ens = _ens;
        _transferOwnership(_ens.owner(bytes32(0)));
    }

    event NameWrapperUpgraded(
        address indexed oldNameWrapper,
        address indexed newNameWrapper
    );

    function upgrade(address _old, address _new) external onlyOwner {
        if (address(_old) == address(0)) {
            isNameWrapper[address(_new)] = true;
        } else {
            require(isNameWrapper[address(_old)], "Old Not NameWrapper");

            if (forward[_old] != address(0)) {
                delete forward[forward[_old]];
                delete backward[forward[_old]];
            }

            forward[_old] = _new;
            backward[_new] = _old;

            isNameWrapper[address(_new)] = true;
        }

        emit NameWrapperUpgraded(address(_old), address(_new));
    }

    event SetAttestation(address indexed attestation);
    function setAttestation(address _attestation) external onlyOwner {
        attestation = _attestation;
        emit SetAttestation(attestation);
    }

    function ownerOf(bytes32 node) public view returns(address owner) {
        owner = ens.owner(node);
        // if (isNameWrapper[owner]) {
        //     owner = INameWrapper(owner).ownerOf(uint256(node));
        // }
    }

    function supportsInterface(
        bytes4 interfaceID
    ) public view virtual override(IERC165) returns (bool) {
        return false;
        // return interfaceID == type(INameWrapperRegistry).interfaceId;
    }
}