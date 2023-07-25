// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

import "./InsuranceConstants.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import "./InsuranceOwnershipToken.sol";
import "./InsurancePool.sol";
import "./InsuranceMasterchef.sol";

import "./interfaces/IInsuranceRegistrar.sol";
import "./interfaces/IInsuranceRoleResolver.sol";
import "./interfaces/IDiamondResolverAuth.sol";

import "./ArbitrationManager.sol";

contract InsuranceRegistrar is
    Ownable,
    IInsuranceRegistrar,
    ArbitrationManager
{
    using SafeERC20 for IERC20;

    ENS public immutable ens;
    INameWrapperRegistry public immutable registry;

    address public immutable poolTemplate;
    address public immutable masterchefTemplate;
    address public immutable ownershipTokenTemplate;

    mapping(bytes32 => PoolInformation) private _poolInformation;
    mapping(bytes32 => InsurancePool) public nodePool;
    mapping(bytes32 => mapping(address => bool))
        public trustedArbitrableProxies;

    uint256 public defaultFactoryFee = 300;
    uint256 public defaultMaxFactoryFee = 1000;

    mapping(bytes32 => InsuranceInformation) private _insurances;

    constructor(
        INameWrapperRegistry _registry,
        address _poolTemplate,
        address _masterchefTemplate,
        address _ownershipTokenTemplate
    ) Ownable(msg.sender) EIP712("VeryInsureInsuranceRegistrar", "1") {
        registry = _registry;
        ens = registry.ens();

        poolTemplate = _poolTemplate;
        masterchefTemplate = _masterchefTemplate;
        ownershipTokenTemplate = _ownershipTokenTemplate;
    }

    // Check if the resolver authorized this one if supported. Otherwise, only owner is authorised
    function isAuthorised(
        address sender,
        bytes32 node,
        bytes32 role
    ) public view returns (bool) {
        address resolver = ens.resolver(node);

        if (resolver == address(0)) {
            return registry.ownerOf(node) == sender;
        }

        try IERC165(resolver).supportsInterface(type(IInsuranceRoleResolver).interfaceId) returns (bool supportRoleResolver) {
            if (supportRoleResolver) {
                return IInsuranceRoleResolver(resolver).isAuthorised(sender, node, role);
            } else if (IERC165(resolver).supportsInterface(type(IDiamondResolverAuth).interfaceId)) {
                return IDiamondResolverAuth(resolver).isAuthorised(sender, node);
            } else {
                return registry.ownerOf(node) == sender;
            }
        } catch {
            return registry.ownerOf(node) == sender;
        }
    }

    modifier authorised(bytes32 node, bytes32 role) {
        if (!isAuthorised(msg.sender, node, role)) {
            revert Unauthorised(msg.sender, node);
        }
        _;
    }

    modifier poolDeployed(bytes32 node) {
        if (address(nodePool[node]) == address(0)) {
            revert PoolNotFound(node);
        }
        _;
    }

    // =================================================
    // STRUCT VIEW FUNCTIONS
    // =================================================

    function poolInformation(bytes32 node) external view returns(PoolInformation memory) {
        return _poolInformation[node];
    }

    function insurances(bytes32 node) external view returns(InsuranceInformation memory) {
        return _insurances[node];
    }

    // =================================================
    // POOL DEPLOYMENT
    // =================================================

    event DeployPool(
        bytes32 indexed node,
        address indexed asset,
        address indexed pool,
        address masterchef,
        address ownershipToken,
        address deployer,
        uint256 ownerShare
    );

    function deployPool(
        bytes32 node,
        IERC20 asset,
        uint256 expiration,
        uint256 ownerShare,
        uint256 withdrawalFee,
        uint256 instantReward,
        string memory name,
        string memory symbol
    ) public authorised(node, ROLE_DEPLOY_POOL) {
        // Check if the domain is not already used as a pool deployer
        if (address(nodePool[node]) != address(0)) {
            revert DomainAlreadyUsed(node);
        }

        if (ownerShare > 10000) {
            revert OverLimit();
        }

        // This technique enable stable pool address across chains

        InsuranceMasterchef masterchef = InsuranceMasterchef(
            Clones.cloneDeterministic(masterchefTemplate, node)
        );

        InsurancePool pool = InsurancePool(
            Clones.cloneDeterministic(poolTemplate, node)
        );

        pool.initialize(
            node,
            asset,
            masterchef,
            expiration,
            withdrawalFee,
            instantReward,
            name,
            symbol
        );

        masterchef.initialize(address(pool));

        InsuranceOwnershipToken ownershipToken = InsuranceOwnershipToken(
            Clones.cloneDeterministic(ownershipTokenTemplate, node)
        );
        ownershipToken.initialize(node, name, symbol);

        PoolInformation memory info = PoolInformation({
            owner: node,
            pool: pool,
            masterchef: masterchef,
            ownershipToken: ownershipToken,
            factoryFee: defaultFactoryFee,
            factoryMaxFee: defaultMaxFactoryFee,
            ownerShare: ownerShare
        });

        _poolInformation[node] = info;
        nodePool[node] = pool;

        emit DeployPool(
            node,
            address(asset),
            address(pool),
            address(masterchef),
            address(ownershipToken),
            msg.sender,
            ownerShare
        );
    }

    // =================================================
    // FACTORY FEE MANAGEMENT
    // =================================================

    event AdjustFactoryFee(address indexed setter, uint256 factoryFee);

    function adjustFactoryFee(
        bytes32 node,
        uint256 _factoryFee
    ) public onlyOwner poolDeployed(node) {
        if (_factoryFee > _poolInformation[node].factoryMaxFee)
            revert OverLimit();

        _poolInformation[node].factoryFee = _factoryFee;

        emit AdjustFactoryFee(msg.sender, _factoryFee);
    }

    event SetMaxFactoryFee(address indexed setter, uint256 maxFactoryFee);

    function increaseMaxFactoryFee(
        bytes32 node,
        uint256 _maxFactoryFee
    ) public authorised(node, ROLE_SET_FACTORY_FEE) poolDeployed(node) {
        if (
            _maxFactoryFee > 10000 ||
            _maxFactoryFee < _poolInformation[node].factoryMaxFee
        ) {
            revert OverLimit();
        }

        _poolInformation[node].factoryMaxFee = _maxFactoryFee;

        emit SetMaxFactoryFee(msg.sender, _maxFactoryFee);
    }

    function decreaseMaxFactoryFee(
        bytes32 node,
        uint256 _maxFactoryFee
    ) public onlyOwner poolDeployed(node) {
        if (
            _maxFactoryFee > 10000 ||
            _maxFactoryFee > _poolInformation[node].factoryMaxFee
        ) {
            revert OverLimit();
        }

        _poolInformation[node].factoryMaxFee = _maxFactoryFee;

        emit SetMaxFactoryFee(msg.sender, _maxFactoryFee);
    }

    event SetDefaultFactoryFee(address indexed setter, uint256 factoryFee);

    function setDefaultFactoryFee(uint256 _defaultFactoryFee) public onlyOwner {
        if (_defaultFactoryFee > defaultMaxFactoryFee) revert OverLimit();
        defaultFactoryFee = _defaultFactoryFee;
        emit SetDefaultFactoryFee(msg.sender, _defaultFactoryFee);
    }

    // =================================================
    // ARBITRATION MANAGEMENT
    // =================================================

    event SetTrustedArbitrableProxy(
        bytes32 indexed node,
        address indexed proxy,
        address indexed setter,
        bool trusted
    );

    function setTrustedArbitrableProxy(
        bytes32 node,
        address proxy,
        bool trusted
    ) public authorised(node, ROLE_SET_TRUSTED_ARBITRABLE_PROXY) poolDeployed(node) {
        trustedArbitrableProxies[node][proxy] = trusted;
        emit SetTrustedArbitrableProxy(node, proxy, msg.sender, trusted);
    }

    function isTrustedProxy(
        bytes32 _node,
        IArbitrableProxy _proxy
    ) public view virtual override(ArbitrationManager, IInsuranceRegistrar) returns (bool) {
        return trustedArbitrableProxies[_node][address(_proxy)];
    }

    // =================================================
    // BUY INSURANCE
    // =================================================

    event BuyInsurance(bytes32 indexed node, bytes32 indexed pool, address indexed approver, uint256 disputeId, uint256 price);
    function _buyInsurance(bytes32 node) internal {
        InsuranceInformation memory insurance = _insurances[node];
        PoolInformation memory info = _poolInformation[insurance.pool];
        InsurancePool pool = nodePool[insurance.pool];
        IERC20 asset = IERC20(pool.asset());

        if (pool.expiration() < insurance.expiration) {
            revert PoolExpired(insurance.pool, pool.expiration());
        }

        insurance.approvedAt = block.timestamp;

        asset.safeTransferFrom(msg.sender, address(this), insurance.price);

        // Distribute to ownership token and factory fee
        uint256 ownerFee = insurance.price * info.ownerShare / 10000;
        uint256 factoryFee = insurance.price * info.factoryFee / 10000;

        asset.safeIncreaseAllowance(address(info.ownershipToken), ownerFee);
        info.ownershipToken.distribute(asset, ownerFee);

        asset.transfer(owner(), factoryFee);

        uint256 remaining = insurance.price - ownerFee - factoryFee;

        asset.safeIncreaseAllowance(address(pool), remaining);
        pool.distribute(remaining);

        emit BuyInsurance(node, insurance.pool, insurance.approver, insurance.disputeId, insurance.price);
    }

    event PendingInsurance(bytes32 indexed node, bytes32 indexed pool, address indexed approver, uint256 disputeId);
    function buyInsuranceWithArbitration(
        bytes32 node,
        bytes32 pool,
        uint256 price,
        uint256 expiration,
        IArbitrableProxy proxy,
        bytes calldata data,
        bytes calldata arbitratorExtraData,
        string calldata metaEvidenceURI
    ) public payable authorised(node, ROLE_BUY_INSURANCE) {
        if (_insurances[node].node != bytes32(0)) {
            revert InsuranceAlreadyExists(node);
        }

        if (nodePool[pool].expiration() < expiration) {
            revert PoolExpired(pool, nodePool[pool].expiration());
        }

        uint256 disputeId = createDispute(
            pool,
            proxy,
            arbitratorExtraData,
            metaEvidenceURI
        );

        _insurances[node] = InsuranceInformation({
            node: node,
            pool: pool,
            price: price,
            expiration: expiration,
            approver: address(proxy),
            disputeId: disputeId,
            approvedAt: 0,
            data: data,
            arbitratorExtraData: arbitratorExtraData,
            metaEvidenceURI: metaEvidenceURI
        });

        emit PendingInsurance(node, pool, address(proxy), disputeId);
    }

    function _buyInsuranceFinalize(
        bytes32 node,
        bytes32 pool,
        IArbitrableProxy proxy,
        uint256 disputeId
    ) internal executeDispute(pool, proxy, disputeId) {
        _buyInsurance(node);
    }

    function buyInsuranceFinalize(bytes32 node) public authorised(node, ROLE_BUY_INSURANCE) {
        if (_insurances[node].node == bytes32(0)) {
            revert InsuranceNotExists(node);
        }

        _buyInsuranceFinalize(node, _insurances[node].pool, IArbitrableProxy(_insurances[node].approver), _insurances[node].disputeId);
    }

    function _buyInsuranceFinalizeSig(
        bytes32 node,
        address operator,
        uint256 nonce,
        uint256 deadline,
        bytes32 digest,
        bytes calldata signature
    ) internal executeDisputeWithSig(node, operator, nonce, deadline, digest, signature) {
        _buyInsurance(node);
    }

    function buyInsuranceWithSignature(
        bytes32 node,
        bytes32 pool,
        uint256 price,
        uint256 expiration,
        address operator,
        uint256 nonce,
        uint256 deadline,
        bytes calldata data,
        bytes calldata signature
    ) public authorised(node, ROLE_BUY_INSURANCE) {
        if (_insurances[node].node != bytes32(0)) {
            revert InsuranceAlreadyExists(node);
        }

        if (nodePool[pool].expiration() < expiration) {
            revert PoolExpired(pool, nodePool[pool].expiration());
        }

        _insurances[node] = InsuranceInformation({
            node: node,
            pool: pool,
            price: price,
            expiration: expiration,
            approver: operator,
            disputeId: nonce,
            approvedAt: 0,
            data: data,
            arbitratorExtraData: "",
            metaEvidenceURI: ""
        });

        _buyInsuranceFinalizeSig(node, operator, nonce, deadline, keccak256(abi.encode(_insurances[node])), signature);
    }
}
