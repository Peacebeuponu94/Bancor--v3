// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { Token } from "../../token/Token.sol";

error NotWhitelisted();

/**
 * @dev Network Settings interface
 */
interface INetworkSettings is IUpgradeable {
    /**
     * @dev returns the protected tokens whitelist
     */
    function protectedTokenWhitelist() external view returns (Token[] memory);

    /**
     * @dev checks whether a given token is whitelisted
     */
    function isTokenWhitelisted(Token pool) external view returns (bool);

    /**
     * @dev returns the network token funding limit for a given pool
     */
    function poolFundingLimit(Token pool) external view returns (uint256);

    /**
     * @dev returns the minimum network token trading liquidity required before the system enables trading in the
     * relevant pool
     */
    function minLiquidityForTrading() external view returns (uint256);

    /**
     * @dev returns the global network fee (in units of PPM)
     *
     * notes:
     *
     * - the network fee is a portion of the total fees from each pool
     */
    function networkFeePPM() external view returns (uint32);

    /**
     * @dev returns the withdrawal fee (in units of PPM)
     */
    function withdrawalFeePPM() external view returns (uint32);

    /**
     * @dev returns the flash-loan fee (in units of PPM)
     */
    function flashLoanFeePPM() external view returns (uint32);

    /**
     * @dev returns the percentage of the converted network tokens to be sent to the caller of the burning event (in
     * units of PPM)
     */
    function vortexBurnRewardPPM() external view returns (uint32);

    /**
     * @dev returns the maximum burn reward to be sent to the caller of the burning event
     */
    function vortexBurnRewardMaxAmount() external view returns (uint256);
}
