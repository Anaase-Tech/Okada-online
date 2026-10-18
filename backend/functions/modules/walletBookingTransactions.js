'use strict';

async function createWalletBackedBooking({
  db,
  fieldValue,
  userRef,
  serviceRef,
  serviceData,
  amount,
  userUpdates = {},
  additionalWrites = [],
}) {
  const charge = Number(amount);
  if (!Number.isFinite(charge) || charge <= 0) return { blocked: 'invalid-amount' };

  return db.runTransaction(async (transaction) => {
    // Read both authoritative user state and the target service ref before
    // writing. Reusing the same service reference cannot debit the wallet twice.
    const [userSnapshot, serviceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(serviceRef),
    ]);
    if (!userSnapshot.exists) return { blocked: 'user-not-found' };
    if (serviceSnapshot.exists) return { blocked: 'already-exists' };

    const available = Number(userSnapshot.data()?.wallet?.available ?? 0);
    if (!Number.isFinite(available) || available < 0) {
      return { blocked: 'invalid-wallet', available };
    }
    if (available < charge) return { blocked: 'insufficient-funds', available };

    transaction.create(serviceRef, serviceData);
    transaction.update(userRef, {
      'wallet.available': fieldValue.increment(-charge),
      ...userUpdates,
    });
    for (const write of additionalWrites) {
      transaction.create(write.ref, write.data);
    }
    return { created: true, availableAfter: available - charge };
  });
}

module.exports = { createWalletBackedBooking };
