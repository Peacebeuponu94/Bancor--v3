import Contracts, { TestMathEx } from '../../components/Contracts';
import { Exponentiation } from '../../utils/Constants';
import { Fraction, toUint512, fromUint512, toString, toPPT, toPPM } from '../../utils/Types';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const EXP_INPUT_TOO_HIGH = Exponentiation.INPUT_TOO_HIGH;

const MAX_UINT32 = BigNumber.from(2).pow(32).sub(1);
const MAX_UINT64 = BigNumber.from(2).pow(64).sub(1);
const MAX_UINT96 = BigNumber.from(2).pow(96).sub(1);
const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);
const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);

const TEST_ARRAY = [
    BigNumber.from(0),
    BigNumber.from(100),
    BigNumber.from(10_000),
    MAX_UINT128,
    MAX_UINT256.div(2),
    MAX_UINT256.sub(MAX_UINT128),
    MAX_UINT256
];

const mulDivFuncs = {
    mulDivF: (x: BigNumber, y: BigNumber, z: BigNumber) => x.mul(y).div(z),
    mulDivC: (x: BigNumber, y: BigNumber, z: BigNumber) => x.mul(y).add(z).sub(1).div(z)
};

const comp512Funcs = {
    gt512: (x: BigNumber, y: BigNumber) => x.gt(y),
    lt512: (x: BigNumber, y: BigNumber) => x.lt(y),
    gte512: (x: BigNumber, y: BigNumber) => x.gte(y),
    lte512: (x: BigNumber, y: BigNumber) => x.lte(y)
};

const toDecimal = (fraction: Fraction<BigNumber>) => new Decimal(fraction.n.toString()).div(fraction.d.toString());

describe('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const testExp = (f: Fraction, maxRelativeError: Decimal) => {
        it(`exp(${f.n} / ${f.d})`, async () => {
            if (f.n / f.d < EXP_INPUT_TOO_HIGH) {
                const actual = await mathContract.exp(f);
                const expected = new Decimal(f.n).div(f.d).exp();
                await expect(actual).to.be.almostEqual(
                    { n: expected, d: 1 },
                    {
                        maxRelativeError,
                        relation: Relation.LesserOrEqual
                    }
                );
            } else {
                await expect(mathContract.exp(f)).to.revertedWith('Overflow');
            }
        });
    };

    const testWeightedAverage = (fraction1: Fraction<BigNumber>, fraction2: Fraction<BigNumber>, weight1: number, maxRelativeError: Decimal) => {
        it(`weightedAverage(${toString(fraction1)}, ${toString(fraction2)}, ${weight1}%)`, async () => {
            const expected = toDecimal(fraction1).mul(weight1).add(toDecimal(fraction2).mul(100 - weight1)).div(100);
            const actual = await mathContract.weightedAverage(fraction1, fraction2, toPPT(weight1));
            expect(actual).to.almostEqual({ n: expected, d: 1 }, { maxRelativeError });
        });
    };

    const testIsInRange = (baseSample: Fraction<BigNumber>, offsetSample: Fraction<BigNumber>, maxDeviation: number) => {
        it(`isInRange(${toString(baseSample)}, ${toString(offsetSample)}, ${maxDeviation}%)`, async () => {
            const mid = toDecimal(offsetSample);
            const min = toDecimal(baseSample).mul(100 - maxDeviation).div(100);
            const max = toDecimal(baseSample).mul(100 + maxDeviation).div(100);
            const expected = min.lte(mid) && mid.lte(max);
            const actual = await mathContract.isInRange(baseSample, offsetSample, toPPM(maxDeviation));
            expect(actual).to.equal(expected);
        });
    };

    const testMulDiv = (x: BigNumber, y: BigNumber, z: BigNumber) => {
        for (const funcName in mulDivFuncs) {
            it(`${funcName}(${x}, ${y}, ${z})`, async () => {
                const expectedFunc = (mulDivFuncs as any)[funcName];
                const actualFunc = (mathContract as any)[funcName];
                const expected = expectedFunc(x, y, z);
                if (expected.lte(MAX_UINT256)) {
                    const actual = await actualFunc(x, y, z);
                    expect(actual).to.equal(expected);
                } else {
                    await expect(actualFunc(x, y, z)).to.be.revertedWith('Overflow');
                }
            });
        }
    };

    const testSubMax0 = (x: BigNumber, y: BigNumber) => {
        it(`subMax0(${x}, ${y})`, async () => {
            const expected = BigNumber.max(x.sub(y), 0);
            const actual = await mathContract.subMax0(x, y);
            expect(actual).to.equal(expected);
        });
    };

    const testMul512 = (x: BigNumber, y: BigNumber) => {
        it(`mul512(${x}, ${y})`, async () => {
            const expected = x.mul(y);
            const actual = await mathContract.mul512(x, y);
            expect(fromUint512(actual)).to.equal(expected);
        });
    };

    const testComp512 = (a: BigNumber, b: BigNumber) => {
        for (const x of [a, a.add(1).mul(b)]) {
            for (const y of [b, b.add(1).mul(a)]) {
                for (const funcName in comp512Funcs) {
                    it(`${funcName}(${x}, ${y})`, async () => {
                        const expectedFunc = (comp512Funcs as any)[funcName];
                        const actualFunc = (mathContract as any)[funcName];
                        const expected = expectedFunc(x, y);
                        const actual = await actualFunc(toUint512(x), toUint512(y));
                        expect(actual).to.equal(expected);
                    });
                }
            }
        }
    };

    describe('quick tests', () => {
        for (let n = 0; n < 10; n++) {
            for (let d = 1; d < 10; d++) {
                testExp({ n, d }, new Decimal('0.000000000000000000000000000000000002'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 1; n <= 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000002'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = d - 10; n <= d - 1; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000003'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = d + 1; n <= d + 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000002'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 2 * d - 10; n <= 2 * d - 1; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000003'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 2 * d + 1; n <= 2 * d + 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000002'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = EXP_INPUT_TOO_HIGH * d - 10; n <= EXP_INPUT_TOO_HIGH * d - 1; n++) {
                testExp({ n, d }, new Decimal('0.000000000000000000000000000000000002'));
            }
        }

        for (const n of [MAX_UINT64, MAX_UINT96]) {
            for (const d of [MAX_UINT64, MAX_UINT96]) {
                const fraction1 = { n, d };
                for (const n of [MAX_UINT64, MAX_UINT96]) {
                    for (const d of [MAX_UINT64, MAX_UINT96]) {
                        const fraction2 = { n, d };
                        for (const weight1 of [20, 80]) {
                            testWeightedAverage(fraction1, fraction2, weight1, new Decimal('5e-155'));
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT64, MAX_UINT96]) {
            for (const d of [MAX_UINT64, MAX_UINT96]) {
                const baseSample = { n, d };
                for (const n of [MAX_UINT64, MAX_UINT96]) {
                    for (const d of [MAX_UINT64, MAX_UINT96]) {
                        const offsetSample = { n, d };
                        for (const maxDeviation of [2, 5]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const px of [128, 192, 256]) {
            for (const py of [128, 192, 256]) {
                for (const pz of [128, 192, 256]) {
                    for (const ax of [3, 5, 7]) {
                        for (const ay of [3, 5, 7]) {
                            for (const az of [3, 5, 7]) {
                                const x = BigNumber.from(2).pow(px).div(ax);
                                const y = BigNumber.from(2).pow(py).div(ay);
                                const z = BigNumber.from(2).pow(pz).div(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const x of TEST_ARRAY) {
            for (const y of TEST_ARRAY) {
                testSubMax0(x, y);
                testMul512(x, y);
                testComp512(x, y);
            }
        }
    });

    describe('@stress tests', () => {
        for (let n = 0; n < 100; n++) {
            for (let d = 1; d < 100; d++) {
                testExp({ n, d }, new Decimal('0.000000000000000000000000000000000002'));
            }
        }

        for (const n of [0, 1, 2, 3]) {
            for (const d of [1, 2, 3, 4]) {
                const fraction1 = { n: BigNumber.from(n), d: BigNumber.from(d) };
                for (const n of [0, 1, 2, 3]) {
                    for (const d of [1, 2, 3, 4]) {
                        const fraction2 = { n: BigNumber.from(n), d: BigNumber.from(d) };
                        for (const weight1 of [0, 20, 80, 100]) {
                            testWeightedAverage(fraction1, fraction2, weight1, new Decimal('4e-155'));
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
            for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                const fraction1 = { n, d };
                for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        const fraction2 = { n, d };
                        for (const weight1 of [0, 20, 80, 100]) {
                            testWeightedAverage(fraction1, fraction2, weight1, new Decimal('2e-154'));
                        }
                    }
                }
            }
        }

        for (const n of [0, 1, 2, 3]) {
            for (const d of [1, 2, 3, 4]) {
                const baseSample = { n: BigNumber.from(n), d: BigNumber.from(d) };
                for (const n of [0, 1, 2, 3]) {
                    for (const d of [1, 2, 3, 4]) {
                        const offsetSample = { n: BigNumber.from(n), d: BigNumber.from(d) };
                        for (const maxDeviation of [0, 2, 5, 10]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
            for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                const baseSample = { n, d };
                for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        const offsetSample = { n, d };
                        for (const maxDeviation of [0, 2, 5, 10]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const px of [0, 64, 128, 192, 255, 256]) {
            for (const py of [0, 64, 128, 192, 255, 256]) {
                for (const pz of [1, 64, 128, 192, 255, 256]) {
                    for (const ax of px < 256 ? [-1, 0, +1] : [-1]) {
                        for (const ay of py < 256 ? [-1, 0, +1] : [-1]) {
                            for (const az of pz < 256 ? [-1, 0, +1] : [-1]) {
                                const x = BigNumber.from(2).pow(px).add(ax);
                                const y = BigNumber.from(2).pow(py).add(ay);
                                const z = BigNumber.from(2).pow(pz).add(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const px of [64, 128, 192, 256]) {
            for (const py of [64, 128, 192, 256]) {
                for (const pz of [64, 128, 192, 256]) {
                    for (const ax of [BigNumber.from(2).pow(px >> 1), 1]) {
                        for (const ay of [BigNumber.from(2).pow(py >> 1), 1]) {
                            for (const az of [BigNumber.from(2).pow(pz >> 1), 1]) {
                                const x = BigNumber.from(2).pow(px).sub(ax);
                                const y = BigNumber.from(2).pow(py).sub(ay);
                                const z = BigNumber.from(2).pow(pz).sub(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const px of [128, 192, 256]) {
            for (const py of [128, 192, 256]) {
                for (const pz of [128, 192, 256]) {
                    for (const ax of [3, 5, 7]) {
                        for (const ay of [3, 5, 7]) {
                            for (const az of [3, 5, 7]) {
                                const x = BigNumber.from(2).pow(px).div(ax);
                                const y = BigNumber.from(2).pow(py).div(ay);
                                const z = BigNumber.from(2).pow(pz).div(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }
    });
});
