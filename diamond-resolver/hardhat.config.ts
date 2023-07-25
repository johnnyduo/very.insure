import { exec as _exec } from 'child_process'

import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-solhint'
import '@nomiclabs/hardhat-truffle5'
import '@nomiclabs/hardhat-waffle'
import dotenv from 'dotenv'
import 'hardhat-abi-exporter'
import 'hardhat-deploy'
import 'hardhat-gas-reporter'
import { HardhatUserConfig, task } from 'hardhat/config'
import { Artifact } from 'hardhat/types'
import { promisify } from 'util'
import 'hardhat-contract-sizer'

const exec = promisify(_exec)

// hardhat actions
import './tasks/accounts'
import './tasks/archive_scan'
import './tasks/save'
import './tasks/seed'

// Load environment variables from .env file. Suppress warnings using silent
// if this file is missing. dotenv will never modify any environment variables
// that have already been set.
// https://github.com/motdotla/dotenv
dotenv.config({ debug: false })

let real_accounts = undefined
if (process.env.DEPLOYER_KEY) {
  real_accounts = [
    process.env.DEPLOYER_KEY,
    process.env.OWNER_KEY || process.env.DEPLOYER_KEY,
  ]
}

// circular dependency shared with actions
// export const archivedDeploymentPath = './deployments/archive'

const config: HardhatUserConfig = {
  networks: {
    hardhat: {
      saveDeployments: false,
      tags: ['test', 'use_root'],
      allowUnlimitedContractSize: false,
    },
    localhost: {
      url: 'http://127.0.0.1:8545',
      saveDeployments: false,
      tags: ['test', 'legacy', 'use_root'],
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`,
      tags: ['test', 'legacy', 'use_root'],
      chainId: 4,
      accounts: real_accounts,
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`,
      tags: ['test', 'legacy', 'use_root'],
      chainId: 3,
      accounts: real_accounts,
    },
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_API_KEY}`,
      tags: ['test', 'use_root'],
      chainId: 5,
      accounts: real_accounts,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      tags: ['legacy', 'use_root'],
      chainId: 1,
      accounts: real_accounts,
    },

    optimism_goerli: {
      url: `https://opt-goerli.g.alchemy.com/v2/Uqc2nrzJBeN1oVuuDQ0ON_aPUokXzApf`,
      tags: ['test', 'use_root'],
      chainId: 420,
      accounts: real_accounts,
    },
    base_goerli: {
      url: `https://goerli.base.org`,
      tags: ['test', 'use_root'],
      chainId: 84531,
      accounts: real_accounts,
    },
    polygonzkevm_goerli: {
      url: `https://rpc.public.zkevm-test.net`,
      tags: ['test', 'use_root'],
      chainId: 1442,
      accounts: real_accounts,
    },
    xdc_testnet: {
      url: "https://erpc.apothem.network",
      tags: ['test', 'use_root'],
      chainId: 51,
      accounts: real_accounts,
    },
		gnosis_testnet: {
      url: "https://rpc.chiadochain.net",
      tags: ['test', 'use_root'],
      chainId: 10200,
      accounts: real_accounts,
    },
  },
  mocha: {},
  solidity: {
    compilers: [
      {
        version: '0.8.19',
        settings: {
          optimizer: {
            enabled: true,
            runs: 2499,
          },
        },
      },
    ],
  },
  abiExporter: {
    path: './build/contracts',
    runOnCompile: true,
    clear: true,
    flat: true,
    except: [
      'Controllable$',
      'INameWrapper$',
      'SHA1$',
      'Ownable$',
      'NameResolver$',
      'TestBytesUtils$',
      'legacy/*',
      'SolidStateDiamond',
    ],
    spacing: 2,
    pretty: false,
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
    owner: {
      default: 0,
    },
  },
  // external: {
  //   contracts: [
  //     {
  //       artifacts: [archivedDeploymentPath],
  //     },
  //   ],
  // },
}

export default config
