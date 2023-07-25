const namehash = require('eth-ens-namehash')
const { ethers, network } = require('hardhat')
const { dns } = require('../test-utils')
const sha3 = require('web3-utils').sha3

const UniversalENSRegistry = artifacts.require(
  './universal-registry/UniversalENSRegistry.sol',
)
const UniversalResolverTemplate = artifacts.require(
  './universal-registry/UniversalResolverTemplate.sol',
)
const MockAddrResolver = artifacts.require('./resolvers/MockAddrResolver.sol')

const { exceptions } = require('../test-utils')

let contracts = [[artifacts.require('./registry/ENSRegistry.sol'), 'Solidity']]

const SET_REGISTRY_MAPPING = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('UniversalENSRegistry.setRegistryMapping'),
)

const ZERO_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'
const ADDR_REVERSE = ethers.utils.namehash('addr.reverse')

const LABEL1 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('node1'))
const LABEL2 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('node2'))
const LABEL3 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('node3'))
const LABEL4 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('node4'))
const LABEL5 = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('node5'))

const LABEL_REVERSE = ethers.utils.keccak256(
  ethers.utils.toUtf8Bytes('reverse'),
)
const LABEL_ADDR = ethers.utils.keccak256(ethers.utils.toUtf8Bytes('addr'))

const NODE1 = ethers.utils.namehash('node1')
const NODE2 = ethers.utils.namehash('node2')
const NODE3 = ethers.utils.namehash('node3')
const NODE4 = ethers.utils.namehash('node4')
const NODE5 = ethers.utils.namehash('node5')

const PK1 = '0x53beef782ea38ccddfa2ed51a11ebffdc25c82ddb85dcb4618e5898a40cee62b'
const PK2 = '0x0ae52b7ba3a307bc1385109c51f0056bcd05af3d4e55d0877468229ad5ed4d8e'
const PK3 = '0x094478ae45aa12f3d1868e5780b32c629b009c6bdd340a8215edf65113d2775f'

const OPERATOR1 = new ethers.Wallet(PK1).address
const OPERATOR2 = new ethers.Wallet(PK2).address
const OPERATOR3 = new ethers.Wallet(PK3).address

function getReverseNode(address) {
  return ethers.utils.namehash(
    address.substring(2).toLowerCase() + '.addr.reverse',
  )
}

contracts.forEach(function ([ENS, lang]) {
  contract('ENS ' + lang, function (accounts) {
    let universalResolverTemplate,
      resolver1,
      resolver2,
      resolver3,
      universal,
      ens1,
      ens2,
      ens3

    async function getAddressWithUniversalResolver(operator, name) {
      const node = ethers.utils.namehash(name)
      const UniversalResolverTemplate = await ethers.getContractFactory(
        'UniversalResolverTemplate',
      )
      const registry = await universal.getRegistry(operator, node)
      const resolver = await universal.getResolver(operator, node)
      const ure = UniversalResolverTemplate.attach(
        await universal.getUniversalResolver(operator, node),
      )
      let iface = new ethers.utils.Interface([
        {
          inputs: [
            {
              internalType: 'bytes32',
              name: 'node',
              type: 'bytes32',
            },
          ],
          name: 'addr',
          outputs: [
            {
              internalType: 'address payable',
              name: '',
              type: 'address',
            },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ])
      const address = await ure['resolve(bytes,bytes)'](
        dns.hexEncodeName(name),
        iface.encodeFunctionData('addr', [node]),
      )
      const addressParsed = ethers.utils.getAddress(
        '0x' + address[0].substring(address[0].length - 40, address[0].length),
      )

      const byName1 = await universal.getRegistryByName(
        operator,
        dns.hexEncodeName(name),
      )

      assert.equal(byName1.registry, registry)
      assert.equal(byName1.universalResolver, ure.address)
      assert.equal(byName1.resolver, resolver)
      assert.equal(byName1.node, node)

      const byName2 = await universal.getRegistryByName(
        operator,
        dns.hexEncodeName('test.xyz.abc.def.' + name),
      )

      assert.equal(byName2.registry, registry)
      assert.equal(byName2.universalResolver, ure.address)
      assert.equal(byName2.resolver, resolver)
      assert.equal(
        byName2.node,
        ethers.utils.namehash('test.xyz.abc.def.' + name),
      )

      return addressParsed
    }

    async function setRegistryMapping(pk, nonce, registries, chainId = 0) {
      const signer = new ethers.Wallet(pk)
      const digest = chainId
        ? ethers.utils.solidityKeccak256(
            ['bytes32', 'uint256', 'uint256', 'address[]'],
            [SET_REGISTRY_MAPPING, chainId, nonce, registries],
          )
        : ethers.utils.solidityKeccak256(
            ['bytes32', 'uint256', 'address[]'],
            [SET_REGISTRY_MAPPING, nonce, registries],
          )
      const signature = await signer.signMessage(ethers.utils.arrayify(digest))

      return await universal.setRegistryMapping(
        signer.address,
        nonce,
        registries,
        signature,
      )
    }

    async function setSubnodeOwner(ens, resolver, label, account) {
      await ens.setSubnodeOwner(ZERO_NODE, label, account, {
        from: accounts[0],
      })
      const node = ethers.utils.solidityKeccak256(
        ['bytes32', 'bytes32'],
        [ZERO_NODE, label],
      )
      await ens.setResolver(node, resolver.address, { from: account })
      await resolver.methods['setAddr(bytes32,address)'](node, account, {
        from: account,
      })
    }

    async function setReverseRecord(ens, resolver, account, label) {
      const accountHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes(account.substring(2).toLowerCase()),
      )
      await ens.setSubnodeOwner(ADDR_REVERSE, accountHash, accounts[0], {
        from: accounts[0],
      })
      const node = getReverseNode(account)
      await ens.setResolver(node, resolver.address, { from: accounts[0] })
      await resolver.methods['setName(bytes32,string)'](node, label, {
        from: accounts[0],
      })
    }

    async function setReverseRegistryWithSignature(
      pk,
      ensAddress,
      nonce,
      deadline = 9735689600,
    ) {
      const signer = new ethers.Wallet(pk)

      const domain = {
        name: 'UniversalENSRegistry', // contract deploy name
        version: '1', // contract deploy version
        chainId: network.config.chainId, // env chain id
        verifyingContract: universal.address,
      }

      const types = {
        SetReverseRegistry: [
          { name: 'registry', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      }

      const value = {
        registry: ensAddress,
        nonce,
        deadline,
      }

      const signature = await signer._signTypedData(domain, types, value)

      return await universal.setReverseRegistryWithSignature(
        signer.address,
        ensAddress,
        nonce,
        deadline,
        signature,
      )
    }

    async function getNameWithUniversalResolver(address, operator) {
      const name = address.substring(2).toLowerCase() + '.addr.reverse'
      const node = getReverseNode(address)
      const UniversalResolverTemplate = await ethers.getContractFactory(
        'UniversalResolverTemplate',
      )
      const ure = UniversalResolverTemplate.attach(
        await universal.getReverseUniversalResolver(address, operator),
      )
      const nameBytes = await ure['reverse(bytes)'](dns.hexEncodeName(name))
      console.log(name)
      return nameBytes[0]
    }

    beforeEach(async () => {
      universalResolverTemplate = await UniversalResolverTemplate.new()

      resolver1 = await MockAddrResolver.new()
      resolver2 = await MockAddrResolver.new()
      resolver3 = await MockAddrResolver.new()

      universal = await UniversalENSRegistry.new(
        universalResolverTemplate.address,
      )

      ens1 = await ENS.new(accounts[0])
      ens2 = await ENS.new(accounts[0])
      ens3 = await ENS.new(accounts[0])

      await setSubnodeOwner(ens1, resolver1, LABEL1, accounts[1])
      await setSubnodeOwner(ens1, resolver1, LABEL2, accounts[2])
      // await setSubnodeOwner(ens1, resolver1, LABEL3, accounts[3])

      await setSubnodeOwner(ens2, resolver2, LABEL1, accounts[2])
      // await setSubnodeOwner(ens2, resolver2, LABEL2, accounts[3])
      await setSubnodeOwner(ens2, resolver2, LABEL3, accounts[4])

      // await setSubnodeOwner(ens3, resolver3, LABEL1, accounts[3])
      await setSubnodeOwner(ens3, resolver3, LABEL2, accounts[4])
      await setSubnodeOwner(ens3, resolver3, LABEL3, accounts[5])
      await setSubnodeOwner(ens3, resolver3, LABEL5, accounts[1])

      // Setup reverse node
      for (let ens of [ens1, ens2, ens3]) {
        await ens.setSubnodeOwner(ZERO_NODE, LABEL_REVERSE, accounts[0], {
          from: accounts[0],
        })
        await ens.setSubnodeOwner(
          ethers.utils.namehash('reverse'),
          LABEL_ADDR,
          accounts[0],
          {
            from: accounts[0],
          },
        )
      }
    })

    it('Test nonce', async () => {
      await exceptions.expectFailure(setRegistryMapping(PK1, 0, [ens1.address]))
      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK1, 2, [ens1.address])
      await setRegistryMapping(PK1, 5, [ens2.address])
      await exceptions.expectFailure(setRegistryMapping(PK1, 5, [ens1.address]))
      await exceptions.expectFailure(setRegistryMapping(PK1, 4, [ens1.address]))
      await setRegistryMapping(PK1, 6, [ens1.address, ens2.address])

      await setRegistryMapping(PK2, 3, [ens1.address])
      await setRegistryMapping(PK2, 4, [ens1.address, ens2.address])

      await setRegistryMapping(
        PK2,
        5,
        [ens1.address, ens2.address],
        network.config.chainId,
      )
      await exceptions.expectFailure(
        setRegistryMapping(PK2, 5, [ens1.address, ens2.address], 1),
      )
    })

    it('Test can set gatewayUrlsMapping', async () => {
      await universal.setGatewayUrls(ens1.address, [
        'http://1.1.1.1',
        'http://1.1.1.2',
      ])
      await universal.setGatewayUrls(ens2.address, ['http://2.1.1.1'])

      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      const UniversalResolverTemplate = await ethers.getContractFactory(
        'UniversalResolverTemplate',
      )

      const ure1 = UniversalResolverTemplate.attach(
        await universal.universalResolverMapping(ens1.address),
      )
      const ure2 = UniversalResolverTemplate.attach(
        await universal.universalResolverMapping(ens2.address),
      )
      const ure3 = UniversalResolverTemplate.attach(
        await universal.universalResolverMapping(ens3.address),
      )

      assert.equal(
        JSON.stringify(await ure1.batchGatewayURLs()),
        JSON.stringify(['http://1.1.1.1', 'http://1.1.1.2']),
      )
      assert.equal(
        JSON.stringify(await ure2.batchGatewayURLs()),
        JSON.stringify(['http://2.1.1.1']),
      )
      assert.equal(
        JSON.stringify(await ure3.batchGatewayURLs()),
        JSON.stringify([]),
      )
    })

    it('Test get registry', async () => {
      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(await universal.getRegistry(OPERATOR1, NODE1), ens1.address)
      assert.equal(await universal.getRegistry(OPERATOR1, NODE2), ens1.address)
      assert.equal(await universal.getRegistry(OPERATOR1, NODE3), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR1, NODE4), ADDRESS_ZERO)

      assert.equal(await universal.getRegistry(OPERATOR2, NODE1), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR2, NODE2), ens3.address)
      assert.equal(await universal.getRegistry(OPERATOR2, NODE3), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR2, NODE4), ADDRESS_ZERO)

      await setRegistryMapping(PK3, 1, [OPERATOR1, OPERATOR2])

      assert.equal(await universal.getRegistry(OPERATOR3, NODE1), ens1.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE2), ens1.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE3), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE4), ADDRESS_ZERO)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE5), ens3.address)

      await setRegistryMapping(PK3, 2, [OPERATOR2, OPERATOR1])

      assert.equal(await universal.getRegistry(OPERATOR3, NODE1), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE2), ens3.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE3), ens2.address)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE4), ADDRESS_ZERO)
      assert.equal(await universal.getRegistry(OPERATOR3, NODE5), ens3.address)
    })

    it('Test get resolver', async () => {
      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(
        await universal.getResolver(OPERATOR1, NODE1),
        resolver1.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR1, NODE2),
        resolver1.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR1, NODE3),
        resolver2.address,
      )
      await exceptions.expectFailure(universal.getResolver(OPERATOR1, NODE4))

      assert.equal(
        await universal.getResolver(OPERATOR2, NODE1),
        resolver2.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR2, NODE2),
        resolver3.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR2, NODE3),
        resolver2.address,
      )
      await exceptions.expectFailure(universal.getResolver(OPERATOR2, NODE4))

      await setRegistryMapping(PK3, 1, [OPERATOR1, OPERATOR2])

      assert.equal(
        await universal.getResolver(OPERATOR3, NODE1),
        resolver1.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE2),
        resolver1.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE3),
        resolver2.address,
      )
      await exceptions.expectFailure(universal.getResolver(OPERATOR3, NODE4))
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE5),
        resolver3.address,
      )

      await setRegistryMapping(PK3, 2, [OPERATOR2, OPERATOR1])

      assert.equal(
        await universal.getResolver(OPERATOR3, NODE1),
        resolver2.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE2),
        resolver3.address,
      )
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE3),
        resolver2.address,
      )
      await exceptions.expectFailure(universal.getResolver(OPERATOR3, NODE4))
      assert.equal(
        await universal.getResolver(OPERATOR3, NODE5),
        resolver3.address,
      )
    })

    it('Test get address', async () => {
      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(await universal.getAddr(OPERATOR1, NODE1), accounts[1])
      assert.equal(await universal.getAddr(OPERATOR1, NODE2), accounts[2])
      assert.equal(await universal.getAddr(OPERATOR1, NODE3), accounts[4])
      await exceptions.expectFailure(universal.getResolver(OPERATOR1, NODE4))

      assert.equal(await universal.getAddr(OPERATOR2, NODE1), accounts[2])
      assert.equal(await universal.getAddr(OPERATOR2, NODE2), accounts[4])
      assert.equal(await universal.getAddr(OPERATOR2, NODE3), accounts[4])
      await exceptions.expectFailure(universal.getResolver(OPERATOR2, NODE4))

      await setRegistryMapping(PK3, 1, [OPERATOR1, OPERATOR2])

      assert.equal(await universal.getAddr(OPERATOR3, NODE1), accounts[1])
      assert.equal(await universal.getAddr(OPERATOR3, NODE2), accounts[2])
      assert.equal(await universal.getAddr(OPERATOR3, NODE3), accounts[4])
      await exceptions.expectFailure(universal.getResolver(OPERATOR3, NODE4))
      assert.equal(await universal.getAddr(OPERATOR3, NODE5), accounts[1])

      await setRegistryMapping(PK3, 2, [OPERATOR2, OPERATOR1])

      assert.equal(await universal.getAddr(OPERATOR3, NODE1), accounts[2])
      assert.equal(await universal.getAddr(OPERATOR3, NODE2), accounts[4])
      assert.equal(await universal.getAddr(OPERATOR3, NODE3), accounts[4])
      await exceptions.expectFailure(universal.getResolver(OPERATOR3, NODE4))
      assert.equal(await universal.getAddr(OPERATOR3, NODE5), accounts[1])
    })

    it('Test get address using universal resolver', async () => {
      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR1, 'node1'),
        accounts[1],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR1, 'node2'),
        accounts[2],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR1, 'node3'),
        accounts[4],
      )
      assert.equal(
        await universal.getUniversalResolver(OPERATOR1, NODE4),
        ADDRESS_ZERO,
      )

      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR2, 'node1'),
        accounts[2],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR2, 'node2'),
        accounts[4],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR2, 'node3'),
        accounts[4],
      )
      assert.equal(
        await universal.getUniversalResolver(OPERATOR2, NODE4),
        ADDRESS_ZERO,
      )

      await setRegistryMapping(PK3, 1, [OPERATOR1, OPERATOR2])

      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node1'),
        accounts[1],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node2'),
        accounts[2],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node3'),
        accounts[4],
      )
      assert.equal(
        await universal.getUniversalResolver(OPERATOR3, NODE4),
        ADDRESS_ZERO,
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node5'),
        accounts[1],
      )

      await setRegistryMapping(PK3, 2, [OPERATOR2, OPERATOR1])

      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node1'),
        accounts[2],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node2'),
        accounts[4],
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node3'),
        accounts[4],
      )
      assert.equal(
        await universal.getUniversalResolver(OPERATOR3, NODE4),
        ADDRESS_ZERO,
      )
      assert.equal(
        await getAddressWithUniversalResolver(OPERATOR3, 'node5'),
        accounts[1],
      )
    })

    it('Can resolve basic reverse record', async () => {
      await setReverseRecord(ens1, resolver1, accounts[0], 'node1')
      await setReverseRecord(ens3, resolver3, accounts[0], 'node3')
      await setReverseRecord(ens1, resolver1, accounts[1], 'node2')
      await setReverseRecord(ens2, resolver2, accounts[1], 'node3')

      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(await universal.getName(accounts[0], OPERATOR1), 'node1')
      assert.equal(await universal.getName(accounts[0], OPERATOR2), 'node3')
      assert.equal(await universal.getName(accounts[1], OPERATOR1), 'node2')
      assert.equal(await universal.getName(accounts[1], OPERATOR2), 'node3')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await setRegistryMapping(PK1, 2, [ens3.address, ens1.address])
      await setRegistryMapping(PK2, 2, [ens1.address, ens3.address])

      assert.equal(await universal.getName(accounts[0], OPERATOR1), 'node3')
      assert.equal(await universal.getName(accounts[0], OPERATOR2), 'node1')
      assert.equal(await universal.getName(accounts[1], OPERATOR1), 'node2')
      assert.equal(await universal.getName(accounts[1], OPERATOR2), 'node2')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await universal.setReverseRegistry(ens3.address)

      assert.equal(await universal.getName(accounts[0], OPERATOR1), 'node3')
      assert.equal(await universal.getName(accounts[0], OPERATOR2), 'node3')
      assert.equal(await universal.getName(accounts[1], OPERATOR1), 'node2')
      assert.equal(await universal.getName(accounts[1], OPERATOR2), 'node2')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))
    })

    it('Can resolve reverse record of owned smart contracts', async () => {
      await setReverseRecord(ens1, resolver1, resolver1.address, 'node1')
      await setReverseRecord(ens3, resolver3, resolver1.address, 'node3')
      await setReverseRecord(ens1, resolver1, resolver2.address, 'node2')
      await setReverseRecord(ens2, resolver2, resolver2.address, 'node3')

      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(
        await universal.getName(resolver1.address, OPERATOR1),
        'node1',
      )
      assert.equal(
        await universal.getName(resolver1.address, OPERATOR2),
        'node3',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR1),
        'node2',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR2),
        'node3',
      )
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await setRegistryMapping(PK1, 2, [ens3.address, ens1.address])
      await setRegistryMapping(PK2, 2, [ens1.address, ens3.address])

      assert.equal(
        await universal.getName(resolver1.address, OPERATOR1),
        'node3',
      )
      assert.equal(
        await universal.getName(resolver1.address, OPERATOR2),
        'node1',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR1),
        'node2',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR2),
        'node2',
      )
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await universal.setReverseRegistryForAddr(resolver1.address, ens3.address)

      assert.equal(
        await universal.getName(resolver1.address, OPERATOR1),
        'node3',
      )
      assert.equal(
        await universal.getName(resolver1.address, OPERATOR2),
        'node3',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR1),
        'node2',
      )
      assert.equal(
        await universal.getName(resolver2.address, OPERATOR2),
        'node2',
      )
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))
    })

    it('Can set reverse record with signature', async () => {
      await setReverseRecord(ens1, resolver1, OPERATOR1, 'node1')
      await setReverseRecord(ens3, resolver3, OPERATOR1, 'node3')
      await setReverseRecord(ens1, resolver1, OPERATOR2, 'node2')
      await setReverseRecord(ens2, resolver2, OPERATOR2, 'node3')

      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(await universal.getName(OPERATOR1, OPERATOR1), 'node1')
      assert.equal(await universal.getName(OPERATOR1, OPERATOR2), 'node3')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR1), 'node2')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR2), 'node3')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await setRegistryMapping(PK1, 2, [ens3.address, ens1.address])
      await setRegistryMapping(PK2, 2, [ens1.address, ens3.address])

      assert.equal(await universal.getName(OPERATOR1, OPERATOR1), 'node3')
      assert.equal(await universal.getName(OPERATOR1, OPERATOR2), 'node1')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR1), 'node2')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR2), 'node2')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await setReverseRegistryWithSignature(PK1, ens3.address, 3)

      assert.equal(await universal.getName(OPERATOR1, OPERATOR1), 'node3')
      assert.equal(await universal.getName(OPERATOR1, OPERATOR2), 'node3')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR1), 'node2')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR2), 'node2')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))

      await exceptions.expectFailure(
        setReverseRegistryWithSignature(PK1, ens1.address, 3),
      )
      await exceptions.expectFailure(
        setReverseRegistryWithSignature(PK1, ens1.address, 4, 1),
      )
      await setReverseRegistryWithSignature(PK1, ens1.address, 4)

      assert.equal(await universal.getName(OPERATOR1, OPERATOR1), 'node1')
      assert.equal(await universal.getName(OPERATOR1, OPERATOR2), 'node1')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR1), 'node2')
      assert.equal(await universal.getName(OPERATOR2, OPERATOR2), 'node2')
      await exceptions.expectFailure(universal.getName(accounts[2], OPERATOR1))
    })

    it('Can resolve reverse record with universal resolver', async () => {
      await setReverseRecord(ens1, resolver1, accounts[0], 'node1')
      await setReverseRecord(ens3, resolver3, accounts[0], 'node3')
      await setReverseRecord(ens1, resolver1, accounts[1], 'node2')
      await setReverseRecord(ens2, resolver2, accounts[1], 'node3')

      await setRegistryMapping(PK1, 1, [ens1.address, ens2.address])
      await setRegistryMapping(PK2, 1, [ens2.address, ens3.address])

      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR1),
        'node1',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR2),
        'node3',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR1),
        'node2',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR2),
        'node3',
      )
      await exceptions.expectFailure(
        getNameWithUniversalResolver(accounts[2], OPERATOR1),
      )

      await setRegistryMapping(PK1, 2, [ens3.address, ens1.address])
      await setRegistryMapping(PK2, 2, [ens1.address, ens3.address])

      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR1),
        'node3',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR2),
        'node1',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR1),
        'node2',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR2),
        'node2',
      )
      await exceptions.expectFailure(
        getNameWithUniversalResolver(accounts[2], OPERATOR1),
      )

      await universal.setReverseRegistry(ens3.address)

      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR1),
        'node3',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[0], OPERATOR2),
        'node3',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR1),
        'node2',
      )
      assert.equal(
        await getNameWithUniversalResolver(accounts[1], OPERATOR2),
        'node2',
      )
      await exceptions.expectFailure(
        getNameWithUniversalResolver(accounts[2], OPERATOR1),
      )
    })
  })
})
