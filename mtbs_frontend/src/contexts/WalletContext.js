import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';

/**
 * The current user's wallet balance, loaded once per login and refreshed after
 * anything that moves it (a redeem, a wallet-paid booking, a cancellation).
 *
 * The balance is never written from here — the server owns it and only ever
 * moves it under a row lock. This context just caches the number so the navbar
 * chip and the "pay with wallet" gate don't each have to fetch it.
 *
 * Like the watchlist, this is a customer feature: door staff have no wallet, so
 * `enabled` is false for them and nothing here fetches.
 */
const WalletContext = createContext();

const canHaveWallet = (user) => Boolean(user) && user.role !== 'STAFF';

export const WalletProvider = ({ children }) => {
  const { user } = useAuth();
  const [balance, setBalance] = useState('0.00');
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!canHaveWallet(user)) {
      setBalance('0.00');
      setReady(false);
      return;
    }
    try {
      const res = await api.get('/wallet/');
      setBalance(res.data?.wallet?.balance ?? '0.00');
    } catch {
      setBalance('0.00');
    } finally {
      setReady(true);
    }
  }, [user]);

  // Load on sign-in; clear on logout so the next user never sees the previous
  // one's balance.
  useEffect(() => {
    let cancelled = false;
    if (!canHaveWallet(user)) {
      setBalance('0.00');
      setReady(false);
      return undefined;
    }
    api.get('/wallet/')
      .then((res) => {
        if (!cancelled) setBalance(res.data?.wallet?.balance ?? '0.00');
      })
      .catch(() => {
        if (!cancelled) setBalance('0.00');
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => { cancelled = true; };
  }, [user]);

  const value = {
    balance,
    // A Number for callers that need to compare against a price; the string is
    // kept for display so trailing zeros don't get dropped.
    balanceNumber: Number(balance) || 0,
    enabled: canHaveWallet(user),
    ready,
    refresh,
    setBalance,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};

export default WalletContext;
