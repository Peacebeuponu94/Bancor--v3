import {
    AccessControlEnumerable,
    BNTPool,
    ExternalRewardsVault,
    ProxyAdmin,
    StandardStakingRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ContractName, DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682515-standard-staking-rewards', ContractName.StandardStakingRewardsV1, () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let bntGovernance: TokenGovernance;
    let bntPool: BNTPool;
    let externalRewardsVault: ExternalRewardsVault;
    let standardStakingRewards: StandardStakingRewards;
    let liquidityProtection: string;
    let stakingRewards: string;

    before(async () => {
        ({ deployer, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        bntPool = await DeployedContracts.BNTPoolV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        standardStakingRewards = await DeployedContracts.StandardStakingRewardsV1.deployed();
    });

    it('should deploy and configure the standard rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(standardStakingRewards.address)).to.equal(proxyAdmin.address);

        expect(await standardStakingRewards.version()).to.equal(1);

        await expectRoleMembers(standardStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardStakingRewards.address, bntPool.address, liquidityProtection, stakingRewards]
                : [standardStakingRewards.address, bntPool.address]
        );
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [standardStakingRewards.address]);
    });
});