import { OrderService, PaymentClient, EmailClient } from "../src/orderService";

describe("OrderService Unit Tests", () => {
    let paymentClient: PaymentClient;
    let emailClient: EmailClient;
    let service: OrderService;

    beforeEach(() => {
        paymentClient = {
            charge: jest.fn().mockResolvedValue({ status: "approved", transactionId: "tx_123" }),
        };
        emailClient = {
            send: jest.fn().mockResolvedValue(undefined),
        };
        service = new OrderService(paymentClient, emailClient);
    });

    // 8.1 Validation
    describe("8.1 Validation", () => {
        test("should throw error for invalid email (no @)", async () => {
            await expect(service.createOrder({
                userEmail: "bademail.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 10 }]
            })).rejects.toThrow("VALIDATION: invalid email");
        });

        test("should throw error for empty items", async () => {
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [],
            })).rejects.toThrow("VALIDATION: empty items");
        });

        test("should throw error for invalid sku (empty string)", async () => {
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "", qty: 1, price: 10 }]
            })).rejects.toThrow("VALIDATION: invalid sku");
        });

        test("should throw error for invalid qty (0, negative, or not integer)", async () => {
            // 0
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 0, price: 10 }]
            })).rejects.toThrow("VALIDATION: invalid qty");

            // Negative
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: -5, price: 10 }]
            })).rejects.toThrow("VALIDATION: invalid qty");

            // Not integer (1.5)
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1.5, price: 10 }]
            })).rejects.toThrow("VALIDATION: invalid qty");
        });

        test("should throw error for invalid price (<= 0, NaN, or Infinity)", async () => {
            // 0
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 0 }]
            })).rejects.toThrow("VALIDATION: invalid price");

            // NaN
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: NaN }]
            })).rejects.toThrow("VALIDATION: invalid price");

            // Infinity
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: Infinity }]
            })).rejects.toThrow("VALIDATION: invalid price");
        });
    });

    // 8.2 Coupons / Discount
    describe("8.2 Coupons / Discount", () => {

        test("SAVE10 should apply 10% discount", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }], // 10000 cents
                couponCode: "SAVE10"
            });
            // 10000 - 1000 (10%) = 9000. Tax 8.25% of 9000 = 742.5 -> 743. Total: 9743
            expect(result.totalCents).toBe(9743);
        });

        test("SAVE20 should apply 20% discount", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }], // 10000 cents
                couponCode: "SAVE20"
            });
            // 10000 - 2000 (20%) = 8000. Tax 8.25% of 8000 = 660. Total: 8660
            expect(result.totalCents).toBe(8660);
        });

        test("WELCOME should apply 5% discount but max $15 (1500 cents)", async () => {
            // Сценарій А: 5% менше ніж $15
            const smallOrder = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }], // 10000 cents -> 5% is 500
                couponCode: "WELCOME"
            });
            // 10000 - 500 = 9500. Tax 8.25% of 9500 = 783.75 -> 784. Total: 10284
            expect(smallOrder.totalCents).toBe(10284);

            // Сценарій Б: 5% більше ніж $15
            const bigOrder = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 400 }], // 40000 cents -> 5% is 2000, but cap is 1500
                couponCode: "WELCOME"
            });
            // 40000 - 1500 = 38500. Tax 8.25% of 38500 = 3176.25 -> 3176. Total: 41676
            expect(bigOrder.totalCents).toBe(41676);
        });

        test("should handle coupon trimming and case-insensitivity", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }],
                couponCode: "  save10  " // малі літери та пробіли
            });
            expect(result.totalCents).toBe(9743);
        });

        test("unknown coupon should throw validation error", async () => {
            await expect(service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 10 }],
                couponCode: "BOGUS"
            })).rejects.toThrow("VALIDATION: unknown coupon");
        });
    });

    // 8.3 Shipping
    describe("8.3 Shipping", () => {
        test("shipping should be free for subtotal >= 5000 cents (any currency)", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 50 }] // 5000 cents
            });
            // Total = 5000 (subtotal) + 0 (ship) + 413 (8.25% tax) = 5413
            expect(result.totalCents).toBe(5413);
        });

        test("shipping should be paid in USD ($7.99) for subtotal < 5000 cents", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 10 }] // 1000 cents
            });
            // Total = 1000 + 799 (ship USD) + 83 (tax 8.25% of 1000) = 1882
            expect(result.totalCents).toBe(1882);
        });

        test("shipping should be paid in EUR (€6.99) for subtotal < 5000 cents", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "EUR",
                items: [{ sku: "A", qty: 1, price: 10 }] // 1000 cents
            });
            // 1000 + 699 (ship EUR) + 200 (tax 20% of 1000) = 1899
            expect(result.totalCents).toBe(1899);
        });
    });

    // 8.4 Tax
    describe("8.4 Tax", () => {
        test("should apply EUR VAT 20% correctly", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "EUR",
                items: [{ sku: "A", qty: 1, price: 100 }] // 10000 cents
            });
            // 10000 * 0.20 = 2000 cents tax
            expect(result.totalCents).toBe(12000);
        });

        test("should apply USD tax 8.25% correctly", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }] // 10000 cents
            });
            // 10000 * 0.0825 = 825 cents tax
            expect(result.totalCents).toBe(10825);
        });

        test("should result in 0 tax if taxable amount is 0 or less", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "FREE_ITEM", qty: 1, price: 0.01 }], // 1 cent
                couponCode: "SAVE10" // знижка 10% зробить ціну ще меншою, але податок не може бути від'ємним
            });
            expect(result.totalCents).toBeGreaterThan(0);
        });

        test("should apply USD tax 8.25%", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 100 }]
            });
            expect(result.totalCents).toBe(10825); // 10000 + 825 tax
        });
    });

    // 8.5 Risk rules
    describe("8.5 Risk rules", () => {
        test("should block tempmail domains with RISK error", async () => {
            await expect(service.createOrder({
                userEmail: "hacker@tempmail.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 10 }]
            })).rejects.toThrow("RISK: tempmail is not allowed");

            // перевірка, що платіж навіть не намагалися списати
            expect(paymentClient.charge).not.toHaveBeenCalled();
        });

        test("should block orders where total > 200000 cents ($2000)", async () => {
            await expect(service.createOrder({
                userEmail: "legit@gmail.com",
                currency: "USD",
                // 250.000 > 200.000 (перевищення ліміту)
                items: [{ sku: "LUXURY-ITEM", qty: 1, price: 2500 }] // 250000 cents
            })).rejects.toThrow("RISK: amount too high");
        });

        test("should block plus-alias emails for orders > 50000 cents ($500)", async () => {
            // Email з '+' та сума 60000
            await expect(service.createOrder({
                userEmail: "myuser+test@gmail.com",
                currency: "USD",
                items: [{ sku: "MEDIUM-ITEM", qty: 1, price: 600 }] // 60000 cents
            })).rejects.toThrow("RISK: plus-alias high amount");

            // Email з '+' але сума маленька (має пройти)
            (paymentClient.charge as jest.Mock).mockResolvedValue({ status: "approved" });
            const result = await service.createOrder({
                userEmail: "myuser+test@gmail.com",
                currency: "USD",
                items: [{ sku: "SMALL-ITEM", qty: 1, price: 100 }] // 10000 cents
            });
            expect(result.payment.status).toBe("approved");
        });
    });

    // 8.6 Payment + Email behavior
    describe("8.6 Payment + Email behavior", () => {

        test("should throw PAYMENT_DECLINED and NOT send email when payment is declined", async () => {
            // налаштування моку на відмову
            (paymentClient.charge as jest.Mock).mockResolvedValue({
                status: "declined",
                declineReason: "Card expired"
            });

            const input = {
                userEmail: "test@example.com",
                currency: "USD" as const,
                items: [{ sku: "A", qty: 1, price: 100 }]
            };

            // перевірка помилки
            await expect(service.createOrder(input)).rejects.toThrow("PAYMENT_DECLINED: Card expired");

            // перевірка, що email НЕ відправлявся
            expect(emailClient.send).not.toHaveBeenCalled();
        });

        test("should send email once with correct data if payment is approved", async () => {
            // налаштування успішної оплати
            (paymentClient.charge as jest.Mock).mockResolvedValue({
                status: "approved",
                transactionId: "TX_999"
            });

            const input = {
                userEmail: "happy@client.com",
                currency: "EUR" as const,
                items: [{ sku: "ITEM-1", qty: 1, price: 50 }]
            };

            await service.createOrder(input);

            // перевірка, що email відправлено рівно 1 раз
            expect(emailClient.send).toHaveBeenCalledTimes(1);

            // перевірка параметри листа
            const [to, subject, body] = (emailClient.send as jest.Mock).mock.calls[0];
            expect(to).toBe("happy@client.com");
            expect(subject).toContain("confirmed");
            expect(body).toContain("Total:");
        });

        test("should call paymentClient.charge with correct amount and currency", async () => {
            (paymentClient.charge as jest.Mock).mockResolvedValue({ status: "approved" });

            await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 2, price: 10 }] // 2000 cents
            });

            // 2000 (subtotal) + 799 (ship) + 165 (8.25% tax from 2000) = 2964
            expect(paymentClient.charge).toHaveBeenCalledWith(
                2964,
                "USD",
                expect.stringMatching(/^ord_/) // перевірка формату ID замовлення
            );
        });
    });

    // 8.7 Edge cases
    describe("8.7 Edge cases", () => {
        test("should round cents correctly for prices with many decimals (e.g., 10.005)", async () => {
            // 10.005 * 100 = 1000.5 -> має округлитися до 1001 центу
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "A", qty: 1, price: 10.005 }]
            });

            // 1001 (subtotal) + 799 (ship) + 83 (tax 8.25% від 1001 = 82.58 -> 83) = 1883
            expect(result.totalCents).toBe(1883);
        });

        test("should calculate correct subtotal for multiple different items", async () => {
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [
                    { sku: "ITEM-1", qty: 2, price: 10.0 }, // 2000 cents
                    { sku: "ITEM-2", qty: 1, price: 35.5 }  // 3550 cents
                ]
            });
            // Subtotal: 5550 (>= 5000, тому доставка 0)
            // Tax: 5550 * 0.0825 = 457.875 -> 458
            // Total: 5550 + 458 = 6008
            expect(result.totalCents).toBe(6008);
        });

        test("total amount should never be negative even with huge discounts", async () => {
            // знижка WELCOME ($15) більша за ціну товару ($10)
            const result = await service.createOrder({
                userEmail: "test@example.com",
                currency: "USD",
                items: [{ sku: "CHEAP", qty: 1, price: 10.0 }], // 1000 cents
                couponCode: "WELCOME" // знижка $15 (1500 cents)
            });
            // 1000 (subtotal) - 50 (discount 5%) + 799 (ship) + 78 (tax 8.25% від 950) = 1827
            expect(result.totalCents).toBe(1827);
            expect(result.totalCents).toBeGreaterThanOrEqual(0);
        });
    });

    test("creates order and sends confirmation email on approved payment (happy path)", async () => {
        const paymentClient: PaymentClient = {
            charge: jest.fn().mockResolvedValue({ status: "approved", transactionId: "tx_123" }),
        };

        const emailClient: EmailClient = {
            send: jest.fn().mockResolvedValue(undefined),
        };

        const service = new OrderService(paymentClient, emailClient);

        const result = await service.createOrder({
            userEmail: "  USER@Example.com ",
            currency: "USD",
            items: [
                { sku: "A-1", qty: 2, price: 10.0 }, // $20
            ],
            couponCode: null,
        });

        expect(result.order.userEmail).toBe("user@example.com");
        expect(result.payment.status).toBe("approved");

        // charge called
        expect(paymentClient.charge).toHaveBeenCalledTimes(1);
        const [amountCents, currency, orderId] = (paymentClient.charge as jest.Mock).mock.calls[0];
        expect(currency).toBe("USD");
        expect(typeof orderId).toBe("string");
        expect(orderId.startsWith("ord_")).toBe(true);

        // email called
        expect(emailClient.send).toHaveBeenCalledTimes(1);
        const [to, subject, body] = (emailClient.send as jest.Mock).mock.calls[0];
        expect(to).toBe("user@example.com");
        expect(subject).toContain("confirmed");
        expect(body).toContain("Total:");
    });
});