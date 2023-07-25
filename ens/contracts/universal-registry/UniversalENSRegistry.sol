//SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./UniversalResolverTemplate.sol";
import "../registry/ENS.sol";
import {Resolver, INameResolver, IAddrResolver} from "../resolvers/Resolver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "hardhat/console.sol";

bytes32 constant lookup = 0x3031323334353637383961626364656600000000000000000000000000000000;
bytes32 constant ADDR_REVERSE_NODE = 0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2;
bytes32 constant SET_REGISTRY_MAPPING = keccak256(
    "UniversalENSRegistry.setRegistryMapping"
);
bytes32 constant SET_REVERSE_REGISTRY_TYPEHASH = keccak256(
    "SetReverseRegistry(address registry,uint256 nonce,uint256 deadline)"
);

error InvalidSignature();
error SignatureExpired();
error NonceTooLow(uint256 nonce);
error InvalidReverseRegistry(address registry);
error ReverseRecordNotFound(address addr, address operator);
error NotRegistryOwner();

// Permissionless universal registry to resolve all ENS node regardless of the provider (ENS or Opti.Domains)
contract UniversalENSRegistry is EIP712 {
    using ECDSA for bytes32;

    address public immutable universalResolverTemplate;

    mapping(address => address[]) public registryMapping;
    mapping(address => string[]) internal gatewayUrlsMapping;
    mapping(address => uint256) public currentNonce;
    mapping(address => uint256) public reverseNonce;
    mapping(address => ENS) public reverseRegistryMapping;

    mapping(address => address) public universalResolverMapping;

    constructor(
        address _universalResolverTemplate
    ) EIP712("UniversalENSRegistry", "1") {
        universalResolverTemplate = _universalResolverTemplate;
    }

    function isContract(address _addr) internal view returns (bool) {
        return _addr.code.length > 0;
    }

    function ownsContract(address addr) internal view returns (bool) {
        try Ownable(addr).owner() returns (address owner) {
            return owner == msg.sender;
        } catch {
            return false;
        }
    }

    /**
     * @dev An optimised function to compute the sha3 of the lower-case
     *      hexadecimal representation of an Ethereum address.
     * @param addr The address to hash
     * @return ret The SHA3 hash of the lower-case hexadecimal encoding of the
     *         input address.
     */
    function sha3HexAddress(address addr) private pure returns (bytes32 ret) {
        assembly {
            for {
                let i := 40
            } gt(i, 0) {

            } {
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
                i := sub(i, 1)
                mstore8(i, byte(and(addr, 0xf), lookup))
                addr := div(addr, 0x10)
            }

            ret := keccak256(0, 40)
        }
    }

    // ===================================================
    // UNIVERSAL REGISTRY RESOLVER
    // ===================================================

    event DeployUniversalResolver(
        address indexed deployer,
        address indexed registry,
        address indexed resolver
    );

    function deployUniversalResolver(address registry) public {
        if (universalResolverMapping[registry] != address(0)) return;

        address resolver = Clones.cloneDeterministic(
            universalResolverTemplate,
            bytes32(uint256(uint160(registry)))
        );
        UniversalResolverTemplate(resolver).initialize(ENS(registry));

        universalResolverMapping[registry] = resolver;

        emit DeployUniversalResolver(msg.sender, registry, resolver);
    }

    function upgradeUniversalResolver(
        address template,
        address registry
    ) public {
        if (msg.sender != ENS(registry).owner(bytes32(0))) {
            revert NotRegistryOwner();
        }

        address resolver = Clones.cloneDeterministic(
            template,
            bytes32(uint256(uint160(registry)))
        );
        UniversalResolverTemplate(resolver).initialize(ENS(registry));

        universalResolverMapping[registry] = resolver;

        emit DeployUniversalResolver(msg.sender, registry, resolver);
    }

    event SetRegistryMapping(
        address indexed operator,
        uint256 indexed nonce,
        address[] registries
    );

    function setRegistryMapping(
        address operator,
        uint256 nonce,
        address[] memory registries,
        bytes calldata signature
    ) public {
        bytes32 digest = keccak256(
            abi.encodePacked(SET_REGISTRY_MAPPING, nonce, registries)
        ).toEthSignedMessageHash();

        if (nonce <= currentNonce[operator]) {
            revert NonceTooLow(nonce);
        }

        if (
            !SignatureChecker.isValidSignatureNow(operator, digest, signature)
        ) {
            // Try again with chain id requirement
            bytes32 digestWithChainId = keccak256(
                abi.encodePacked(
                    SET_REGISTRY_MAPPING,
                    block.chainid,
                    nonce,
                    registries
                )
            ).toEthSignedMessageHash();

            if (
                !SignatureChecker.isValidSignatureNow(
                    operator,
                    digestWithChainId,
                    signature
                )
            ) {
                revert InvalidSignature();
            }
        }

        currentNonce[operator] = nonce;
        registryMapping[operator] = registries;

        unchecked {
            uint256 registriesLength = registries.length;
            for (uint256 i; i < registriesLength; ++i) {
                if (isContract(registries[i])) {
                    deployUniversalResolver(registries[i]);
                }
            }
        }

        emit SetRegistryMapping(operator, nonce, registries);
    }

    event SetGatewayUrls(
        address indexed registry,
        address indexed setter,
        string[] urls
    );

    function setGatewayUrls(ENS registry, string[] memory urls) public {
        if (msg.sender != registry.owner(bytes32(0))) {
            revert NotRegistryOwner();
        }

        gatewayUrlsMapping[address(registry)] = urls;

        emit SetGatewayUrls(address(registry), msg.sender, urls);
    }

    function getGatewayUrls(
        address registry
    ) public view returns (string[] memory) {
        return gatewayUrlsMapping[registry];
    }

    // Will return the first registry on the chain the has a resolver set
    function getRegistry(
        address operator,
        bytes32 node
    ) public view returns (ENS registry) {
        unchecked {
            for (uint256 i; i < registryMapping[operator].length; ++i) {
                registry = ENS(registryMapping[operator][i]);
                if (isContract(address(registry))) {
                    if (registry.resolver(node) != address(0)) return registry;
                } else {
                    registry = getRegistry(address(registry), node);
                    if (address(registry) != address(0)) return registry;
                }
            }
        }

        registry = ENS(address(0));
    }

    function getUniversalResolver(
        address operator,
        bytes32 node
    ) public view returns (UniversalResolverTemplate) {
        return
            UniversalResolverTemplate(
                universalResolverMapping[address(getRegistry(operator, node))]
            );
    }

    function getResolver(
        address operator,
        bytes32 node
    ) public view returns (address) {
        return getRegistry(operator, node).resolver(node);
    }

    function getAddr(
        address operator,
        bytes32 node
    ) public view returns (address) {
        return IAddrResolver(getResolver(operator, node)).addr(node);
    }

    function getRegistryByName(
        address operator,
        bytes calldata name
    )
        public
        view
        returns (
            ENS registry,
            UniversalResolverTemplate universalResolver,
            Resolver resolver,
            bytes32 node,
            uint256 finalOffset
        )
    {
        unchecked {
            for (uint256 i; i < registryMapping[operator].length; ++i) {
                registry = ENS(registryMapping[operator][i]);
                if (isContract(address(registry))) {
                    universalResolver = UniversalResolverTemplate(
                        universalResolverMapping[address(registry)]
                    );
                    (resolver, node, finalOffset) = universalResolver
                        .findResolver(name);
                    if (address(resolver) != address(0))
                        return (
                            registry,
                            universalResolver,
                            resolver,
                            node,
                            finalOffset
                        );
                } else {
                    (
                        registry,
                        universalResolver,
                        resolver,
                        node,
                        finalOffset
                    ) = getRegistryByName(address(registry), name);
                    if (address(registry) != address(0))
                        return (
                            registry,
                            universalResolver,
                            resolver,
                            node,
                            finalOffset
                        );
                }
            }
        }

        registry = ENS(address(0));
        universalResolver = UniversalResolverTemplate(address(0));
        resolver = Resolver(address(0));
        node = bytes32(0);
        finalOffset = 0;
    }

    // ===================================================
    // REVERSE REGISTRAR
    // ===================================================

    event SetReverseRegistry(address indexed addr, address indexed registry);

    function _getReverseNode(address addr) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(ADDR_REVERSE_NODE, sha3HexAddress(addr))
            );
    }

    function _setReverseRegistry(
        address addr,
        ENS registry,
        uint256 nonce
    ) internal {
        // Do basic checks
        if (nonce <= reverseNonce[addr]) {
            revert NonceTooLow(nonce);
        }

        if (!isContract(address(registry))) {
            revert InvalidReverseRegistry(address(registry));
        }

        reverseRegistryMapping[addr] = registry;
        reverseNonce[addr] = nonce;

        deployUniversalResolver(address(registry));

        emit SetReverseRegistry(addr, address(registry));
    }

    function setReverseRegistryForAddr(address addr, ENS registry) public {
        if (msg.sender != addr) {
            if (!ownsContract(addr)) {
                revert InvalidSignature();
            }
        }

        _setReverseRegistry(addr, registry, reverseNonce[addr] + 1);
    }

    function setReverseRegistry(ENS registry) public {
        setReverseRegistryForAddr(msg.sender, registry);
    }

    function setReverseRegistryWithSignature(
        address addr,
        ENS registry,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) public {
        if (deadline < block.timestamp) {
            revert SignatureExpired();
        }

        bytes32 structHash = keccak256(
            abi.encode(
                SET_REVERSE_REGISTRY_TYPEHASH,
                address(registry),
                nonce,
                deadline
            )
        );
        bytes32 digest = _hashTypedDataV4(structHash);
        if (!SignatureChecker.isValidSignatureNow(addr, digest, signature)) {
            revert InvalidSignature();
        }

        _setReverseRegistry(addr, registry, nonce);
    }

    function getReverseUniversalResolver(
        address addr,
        address operator
    ) public view returns (UniversalResolverTemplate) {
        bytes32 node = _getReverseNode(addr);
        ENS registry = reverseRegistryMapping[addr];

        if (address(registry) != address(0) && isContract(address(registry))) {
            return
                UniversalResolverTemplate(
                    universalResolverMapping[address(registry)]
                );
        } else {
            return
                UniversalResolverTemplate(
                    universalResolverMapping[
                        address(getRegistry(operator, node))
                    ]
                );
        }
    }

    function getName(
        address addr,
        address operator
    ) public view returns (string memory) {
        bytes32 node = _getReverseNode(addr);
        ENS registry = reverseRegistryMapping[addr];
        address resolver;

        if (address(registry) != address(0) && isContract(address(registry))) {
            resolver = registry.resolver(node);
        } else if (operator != address(0)) {
            resolver = getResolver(operator, node);
        }

        if (resolver != address(0) && isContract(resolver)) {
            return INameResolver(resolver).name(node);
        }

        revert ReverseRecordNotFound(addr, operator);
    }
}
