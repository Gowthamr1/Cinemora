import React from 'react';
import { act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import Wallet from './Wallet';
import axios from '../api/axios';

// Factory mock: keeps Jest from loading the real axios module, which ships
// ESM that CRA's Jest config doesn't transform.
jest.mock('../api/axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));

// Buying now hands off to the checkout page, so the redirect is the assertion.
// Virtual: react-router-dom v7 is ESM-only via package "exports", which
// jest-resolve in CRA can't follow. The mock replaces it outright.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }) => <a href={to} {...props}>{children}</a>,
}), { virtual: true });

// The wallet context is exercised through the page, not re-tested here — the
// balance and the setter are what the page actually reads.
const mockSetBalance = jest.fn();
const mockRefresh = jest.fn();
jest.mock('../contexts/WalletContext', () => ({
  useWallet: () => ({
    balance: '50.00',
    balanceNumber: 50,
    enabled: true,
    ready: true,
    refresh: mockRefresh,
    setBalance: mockSetBalance,
  }),
}));

const CARDS = [
  { id: 1, code: 'GC-AAAA-BBBB-CCCC', amount: '25.00', status: 'ACTIVE',
    created_at: '2026-08-01T10:00:00Z' },
  { id: 2, code: 'GC-DDDD-EEEE-FFFF', amount: '10.00', status: 'REDEEMED',
    created_at: '2026-07-30T10:00:00Z' },
  // Started but never paid for. The server sends no code for these.
  { id: 3, code: null, amount: '50.00', status: 'PENDING',
    created_at: '2026-08-03T10:00:00Z' },
];

const TRANSACTIONS = [
  { id: 1, amount: '25.00', kind: 'REDEEM', balance_after: '50.00',
    description: 'Gift card GC-AAAA-BBBB-CCCC', created_at: '2026-08-01T10:00:00Z' },
  { id: 2, amount: '-30.00', kind: 'BOOKING_SPEND', balance_after: '20.00',
    description: 'Booking BK-1234', created_at: '2026-08-02T10:00:00Z' },
];

const mockLoad = () => {
  axios.get.mockImplementation((url) => {
    if (url === '/wallet/gift-cards/') return Promise.resolve({ data: CARDS });
    if (url === '/wallet/transactions/') return Promise.resolve({ data: TRANSACTIONS });
    return Promise.resolve({ data: {} });
  });
};

const show = async () => { await act(async () => { render(<Wallet />); }); };

afterEach(cleanup);
beforeEach(() => {
  jest.clearAllMocks();
  mockLoad();
});

describe('Wallet page', () => {
  it('shows the balance from context', async () => {
    await show();
    // Scoped to the balance card — "$50.00" is also a denomination button.
    const card = screen.getByText('Wallet balance').closest('section');
    expect(card).toHaveTextContent('$50.00');
  });

  it('lists my gift cards with their codes and status', async () => {
    await show();
    expect(screen.getByText('GC-AAAA-BBBB-CCCC')).toBeInTheDocument();
    expect(screen.getByText('GC-DDDD-EEEE-FFFF')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Redeemed')).toBeInTheDocument();
  });

  it('signs the ledger: credits +, debits −', async () => {
    await show();
    expect(screen.getByText('+$25.00')).toBeInTheDocument();
    expect(screen.getByText('−$30.00')).toBeInTheDocument();
    expect(screen.getByText('bal $20.00')).toBeInTheDocument();
  });

  it('redeeming a code posts it and updates the balance', async () => {
    axios.post.mockResolvedValueOnce({
      data: { message: 'Successfully redeemed $25.00.', new_balance: '75.00' },
    });
    await show();

    fireEvent.change(screen.getByPlaceholderText('GC-XXXX-XXXX-XXXX'),
                     { target: { value: 'GC-AAAA-BBBB-CCCC' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    });

    expect(axios.post).toHaveBeenCalledWith('/wallet/redeem/',
                                            { code: 'GC-AAAA-BBBB-CCCC' });
    expect(mockSetBalance).toHaveBeenCalledWith('75.00');
    await waitFor(() =>
      expect(screen.getByText('Successfully redeemed $25.00.')).toBeInTheDocument());
  });

  it('surfaces the server reason when a code is refused', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { detail: 'This code has already been redeemed.' } },
    });
    await show();

    fireEvent.change(screen.getByPlaceholderText('GC-XXXX-XXXX-XXXX'),
                     { target: { value: 'GC-USED-USED-USED' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Redeem' }));
    });

    await waitFor(() =>
      expect(screen.getByText('This code has already been redeemed.')).toBeInTheDocument());
    // A refused redeem must not move the displayed balance.
    expect(mockSetBalance).not.toHaveBeenCalled();
  });

  it('buying a gift card starts the purchase and hands off to checkout', async () => {
    // The purchase response carries no code — the card is unpaid at this point.
    axios.post.mockResolvedValueOnce({
      data: { id: 7, code: null, amount: '50.00', status: 'PENDING' },
    });
    await show();

    fireEvent.click(screen.getByRole('button', { name: '$50.00' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy \$50\.00 gift card/ }));
    });

    expect(axios.post).toHaveBeenCalledWith('/wallet/gift-cards/purchase/',
                                            { amount: '50.00' });
    // Payment happens on the checkout page, same as booking a ticket.
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/gift-cards/7/payment'));
  });

  it('stays put and explains itself when the purchase is refused', async () => {
    axios.post.mockRejectedValueOnce({
      response: { data: { amount: ['Choose one of the listed denominations.'] } },
    });
    await show();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Buy \$.* gift card/ }));
    });

    await waitFor(() =>
      expect(screen.getByText('Choose one of the listed denominations.')).toBeInTheDocument());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('masks an unpaid card and offers a way to finish paying', async () => {
    await show();

    expect(screen.getByText('Awaiting payment')).toBeInTheDocument();
    // No code is shown for a card nobody has paid for.
    expect(screen.getByText('••••-••••-••••')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Complete payment' }))
      .toHaveAttribute('href', '/gift-cards/3/payment');
  });

  it('renders empty states rather than crashing when nothing is there', async () => {
    axios.get.mockResolvedValue({ data: [] });
    await show();

    expect(screen.getByText('You haven’t bought any gift cards yet.')).toBeInTheDocument();
    expect(screen.getByText('No transactions yet.')).toBeInTheDocument();
  });
});
