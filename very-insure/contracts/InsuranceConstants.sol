//SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.19;

error NoShare();
error AssetNotAllowed(address asset);
error TooManyAssets();

error Unauthorised(address caller, bytes32 node);
error DomainAlreadyUsed(bytes32 node);
error PoolNotFound(bytes32 node);
error OverLimit();

error InsuranceAlreadyExists(bytes32 node);
error InsuranceNotExists(bytes32 node);
error InsuranceExpired(bytes32 node, uint256 expiration);
error IncorrectPool();
error PoolExpired(bytes32 pool, uint256 expiration);
error PoolDrained();

error ClaimNotExists(bytes32 node, uint256 claimId);

uint256 constant MAX_MASTERCHEF_ASSETS = 30;

bytes32 constant ROLE_DEPLOY_POOL = keccak256("veryinsure.roles.DeployPool");
bytes32 constant ROLE_SET_FACTORY_FEE = keccak256("veryinsure.roles.SetFactoryFee");
bytes32 constant ROLE_SET_TRUSTED_ARBITRABLE_PROXY = keccak256("veryinsure.roles.SetTrustedArbitrableProxy");
bytes32 constant ROLE_BUY_INSURANCE = keccak256("veryinsure.roles.BuyInsurance");
bytes32 constant ROLE_CLAIM_INSURANCE = keccak256("veryinsure.roles.ClaimInsurance");
bytes32 constant ROLE_CONCLUDE_POOL = keccak256("veryinsure.roles.ConcludePool");
bytes32 constant ROLE_NEW_OWNERSHIP_REWARD_TOKEN = keccak256("veryinsure.roles.NewOwnershipRewardToken");