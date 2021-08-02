import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { ZERO_ADDRESS, PPM_RESOLUTION } from 'test/helpers/Constants';
import { createTokenHolder, createSystem } from 'test/helpers/Factory';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { NetworkSettings, TokenHolderUpgradeable, TestERC20Token } from 'typechain';

let networkFeeWallet: TokenHolderUpgradeable;

let nonOwner: SignerWithAddress;

let reserveToken: TestERC20Token;

const TOTAL_SUPPLY = BigNumber.from(1_000_000);

describe('NetworkSettings', () => {
    shouldHaveGap('NetworkSettings', '_protectedTokenWhitelist');

    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        networkFeeWallet = await createTokenHolder();

        reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', TOTAL_SUPPLY);
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const { networkSettings } = await createSystem();

            await expect(networkSettings.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const { networkSettings } = await createSystem();

            expect(await networkSettings.version()).to.equal(1);

            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(ZERO_ADDRESS);
            expect(networkFeeParams[1]).to.equal(BigNumber.from(0));
            expect(await networkSettings.networkFeeWallet()).to.equal(ZERO_ADDRESS);
            expect(await networkSettings.networkFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('protected tokens whitelist', async () => {
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.protectedTokenWhitelist()).to.be.empty;
        });

        describe('adding', () => {
            it('should revert when a non-owner attempts to add a token', async () => {
                await expect(
                    networkSettings.connect(nonOwner).addTokenToWhitelist(reserveToken.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when adding an invalid address', async () => {
                await expect(networkSettings.addTokenToWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_INVALID_EXTERNAL_ADDRESS'
                );
            });

            it('should revert when adding an already whitelisted token', async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
                await expect(networkSettings.addTokenToWhitelist(reserveToken.address)).to.be.revertedWith(
                    'ERR_ALREADY_WHITELISTED'
                );
            });

            it('should whitelist a token', async () => {
                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;

                const res = await networkSettings.addTokenToWhitelist(reserveToken.address);
                await expect(res).to.emit(networkSettings, 'TokenAddedToWhitelist').withArgs(reserveToken.address);

                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;
            });
        });

        describe('removing', () => {
            beforeEach(async () => {
                await networkSettings.addTokenToWhitelist(reserveToken.address);
            });

            it('should revert when a non-owner attempts to remove a token', async () => {
                await expect(
                    networkSettings.connect(nonOwner).removeTokenFromWhitelist(reserveToken.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when removing a non-whitelisted token', async () => {
                await expect(networkSettings.removeTokenFromWhitelist(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_NOT_WHITELISTED'
                );

                const reserveToken2 = await Contracts.TestERC20Token.deploy('TKN2', 'TKN2', TOTAL_SUPPLY);
                await expect(networkSettings.removeTokenFromWhitelist(reserveToken2.address)).to.be.revertedWith(
                    'ERR_NOT_WHITELISTED'
                );
            });

            it('should remove a token', async () => {
                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.true;

                const res = await networkSettings.removeTokenFromWhitelist(reserveToken.address);
                await expect(res).to.emit(networkSettings, 'TokenRemovedFromWhitelist').withArgs(reserveToken.address);

                expect(await networkSettings.isTokenWhitelisted(reserveToken.address)).to.be.false;
            });
        });
    });

    describe('pool minting limits', () => {
        const poolMintingLimit = BigNumber.from(12345).mul(BigNumber.from(10).pow(18));
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a pool limit', async () => {
            await expect(
                networkSettings.connect(nonOwner).setPoolMintingLimit(reserveToken.address, poolMintingLimit)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting a pool limit of an invalid address token', async () => {
            await expect(networkSettings.setPoolMintingLimit(ZERO_ADDRESS, poolMintingLimit)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should be to able to set and update pool minting limit of a token', async () => {
            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));

            const res = await networkSettings.setPoolMintingLimit(reserveToken.address, poolMintingLimit);
            await expect(res)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, BigNumber.from(0), poolMintingLimit);

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(poolMintingLimit);

            const res2 = await networkSettings.setPoolMintingLimit(reserveToken.address, BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'PoolMintingLimitUpdated')
                .withArgs(reserveToken.address, poolMintingLimit, BigNumber.from(0));

            expect(await networkSettings.poolMintingLimit(reserveToken.address)).to.equal(BigNumber.from(0));
        });
    });

    describe('network fee params', () => {
        let newNetworkFeeWallet: TokenHolderUpgradeable;
        const newNetworkFee = BigNumber.from(100000);
        let networkSettings: NetworkSettings;

        const expectNetworkFeeParams = async (wallet: TokenHolderUpgradeable | undefined, fee: BigNumber) => {
            const walletAddress = wallet?.address || ZERO_ADDRESS;
            const networkFeeParams = await networkSettings.networkFeeParams();
            expect(networkFeeParams[0]).to.equal(walletAddress);
            expect(networkFeeParams[1]).to.equal(fee);
            expect(await networkSettings.networkFeeWallet()).to.equal(walletAddress);
            expect(await networkSettings.networkFeePPM()).to.equal(fee);
        };

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            await expectNetworkFeeParams(undefined, BigNumber.from(0));

            newNetworkFeeWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the network fee params', async () => {
            await expect(
                networkSettings.connect(nonOwner).setNetworkFeeWallet(newNetworkFeeWallet.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
            await expect(networkSettings.connect(nonOwner).setNetworkFeePPM(newNetworkFee)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when setting the network wallet to an invalid address', async () => {
            await expect(networkSettings.setNetworkFeeWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when setting the network fee to an invalid value', async () => {
            await expect(networkSettings.setNetworkFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update network wallet params', async () => {
            const res = await networkSettings.setNetworkFeeWallet(newNetworkFeeWallet.address);
            await expect(res)
                .to.emit(networkSettings, 'NetworkFeeWalletUpdated')
                .withArgs(ZERO_ADDRESS, newNetworkFeeWallet.address);

            await expectNetworkFeeParams(newNetworkFeeWallet, BigNumber.from(0));

            const res2 = await networkSettings.setNetworkFeePPM(newNetworkFee);
            await expect(res2)
                .to.emit(networkSettings, 'NetworkFeePPMUpdated')
                .withArgs(BigNumber.from(0), newNetworkFee);

            await expectNetworkFeeParams(newNetworkFeeWallet, newNetworkFee);

            const res3 = await networkSettings.setNetworkFeeWallet(networkFeeWallet.address);
            await expect(res3)
                .to.emit(networkSettings, 'NetworkFeeWalletUpdated')
                .withArgs(newNetworkFeeWallet.address, networkFeeWallet.address);

            await expectNetworkFeeParams(networkFeeWallet, newNetworkFee);

            const res4 = await networkSettings.setNetworkFeePPM(BigNumber.from(0));
            await expect(res4)
                .to.emit(networkSettings, 'NetworkFeePPMUpdated')
                .withArgs(newNetworkFee, BigNumber.from(0));

            await expectNetworkFeeParams(networkFeeWallet, BigNumber.from(0));
        });
    });

    describe('withdrawal fee', () => {
        const newWithdrawalFee = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the withdrawal fee', async () => {
            await expect(networkSettings.connect(nonOwner).setWithdrawalFeePPM(newWithdrawalFee)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when setting the withdrawal fee to an invalid value', async () => {
            await expect(networkSettings.setWithdrawalFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update the withdrawal fee', async () => {
            const res = await networkSettings.setWithdrawalFeePPM(newWithdrawalFee);
            await expect(res)
                .to.emit(networkSettings, 'WithdrawalFeePPMUpdated')
                .withArgs(BigNumber.from(0), newWithdrawalFee);

            expect(await networkSettings.withdrawalFeePPM()).to.equal(newWithdrawalFee);

            const res2 = await networkSettings.setWithdrawalFeePPM(BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'WithdrawalFeePPMUpdated')
                .withArgs(newWithdrawalFee, BigNumber.from(0));

            expect(await networkSettings.withdrawalFeePPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('flash-loan fee', () => {
        const newFlashLoanFee = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the flash-loan fee', async () => {
            await expect(networkSettings.connect(nonOwner).setFlashLoanFeePPM(newFlashLoanFee)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when setting the flash-loan fee to an invalid value', async () => {
            await expect(networkSettings.setFlashLoanFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update the flash-loan fee', async () => {
            const res = await networkSettings.setFlashLoanFeePPM(newFlashLoanFee);
            await expect(res)
                .to.emit(networkSettings, 'FlashLoanFeePPMUpdated')
                .withArgs(BigNumber.from(0), newFlashLoanFee);

            expect(await networkSettings.flashLoanFeePPM()).to.equal(newFlashLoanFee);

            const res2 = await networkSettings.setFlashLoanFeePPM(BigNumber.from(0));
            await expect(res2)
                .to.emit(networkSettings, 'FlashLoanFeePPMUpdated')
                .withArgs(newFlashLoanFee, BigNumber.from(0));

            expect(await networkSettings.flashLoanFeePPM()).to.equal(BigNumber.from(0));
        });
    });

    describe('maximum deviation', () => {
        const newMaxDeviation = BigNumber.from(500000);
        let networkSettings: NetworkSettings;

        beforeEach(async () => {
            ({ networkSettings } = await createSystem());

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(BigNumber.from(0));
        });

        it('should revert when a non-owner attempts to set the maximum deviation', async () => {
            await expect(
                networkSettings.connect(nonOwner).setAverageRateMaxDeviationPPM(newMaxDeviation)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting the maximum deviation to an invalid value', async () => {
            await expect(networkSettings.setAverageRateMaxDeviationPPM(BigNumber.from(0))).to.be.revertedWith(
                'ERR_INVALID_PORTION'
            );

            await expect(
                networkSettings.setAverageRateMaxDeviationPPM(PPM_RESOLUTION.add(BigNumber.from(1)))
            ).to.be.revertedWith('ERR_INVALID_PORTION');
        });

        it('should be to able to set and update the maximum deviation', async () => {
            const res = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation);
            await expect(res)
                .to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated')
                .withArgs(BigNumber.from(0), newMaxDeviation);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation);

            const newMaxDeviation2 = BigNumber.from(5000);
            const res2 = await networkSettings.setAverageRateMaxDeviationPPM(newMaxDeviation2);
            await expect(res2)
                .to.emit(networkSettings, 'AverageRateMaxDeviationPPMUpdated')
                .withArgs(newMaxDeviation, newMaxDeviation2);

            expect(await networkSettings.averageRateMaxDeviationPPM()).to.equal(newMaxDeviation2);
        });
    });
});