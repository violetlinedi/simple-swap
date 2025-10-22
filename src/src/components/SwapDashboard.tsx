import { useMemo, useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Contract } from 'ethers';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { MOCK_ETH, MOCK_ZAMA, SIMPLE_SWAP } from '../config/contracts';
import '../styles/SwapDashboard.css';

const DECIMALS = 1_000_000n;

function parseAmountInput(raw: string): bigint {
  const value = raw.trim();
  if (!value) {
    throw new Error('Amount is required');
  }

  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error('Use up to 6 decimal places');
  }

  const [integerPart, fractionalPart = ''] = value.split('.') as [string, string?];
  const paddedFraction = (fractionalPart + '000000').slice(0, 6);

  return BigInt(integerPart) * DECIMALS + BigInt(paddedFraction);
}

function ensureSafeNumber(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount exceeds supported range');
  }
  return Number(amount);
}

export function SwapDashboard() {
  const { address } = useAccount();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const { data: priceData, refetch: refetchPrice } = useReadContract({
    address: SIMPLE_SWAP.address,
    abi: SIMPLE_SWAP.abi,
    functionName: 'price',
  });

  const { data: ownerData } = useReadContract({
    address: SIMPLE_SWAP.address,
    abi: SIMPLE_SWAP.abi,
    functionName: 'owner',
  });

  const [ethAmount, setEthAmount] = useState('');
  const [zamaAmount, setZamaAmount] = useState('');
  const [priceInput, setPriceInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const ownerAddress = useMemo(() => (ownerData ? String(ownerData) : ''), [ownerData]);
  const isOwner = useMemo(
    () => !!address && ownerAddress !== '' && address.toLowerCase() === ownerAddress.toLowerCase(),
    [address, ownerAddress],
  );

  const formattedPrice = useMemo(() => {
    if (typeof priceData === 'bigint') {
      return priceData.toString();
    }
    if (priceData) {
      return String(priceData);
    }
    return '...';
  }, [priceData]);

  const resetMessages = () => {
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const withPending = async (label: string, action: () => Promise<void>) => {
    resetMessages();
    setPendingAction(label);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setErrorMessage(message);
      console.error(message, error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleMint = (token: 'mockETH' | 'mockZama') =>
    withPending(`Minting ${token}`, async () => {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect your wallet first');
      }

      const config = token === 'mockETH' ? MOCK_ETH : MOCK_ZAMA;
      const contract = new Contract(config.address, config.abi, signer);
      const tx = await contract.mint();
      await tx.wait();
      setStatusMessage(`Minted ${token} successfully.`);
    });

  const handleSetOperator = (token: 'mockETH' | 'mockZama') =>
    withPending(`Granting operator for ${token}`, async () => {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect your wallet first');
      }

      const config = token === 'mockETH' ? MOCK_ETH : MOCK_ZAMA;
      const contract = new Contract(config.address, config.abi, signer);
      const expiry = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // 24 hours
      const tx = await contract.setOperator(SIMPLE_SWAP.address, expiry);
      await tx.wait();
      setStatusMessage(`Operator granted for ${token}.`);
    });

  const handleSetPrice = () =>
    withPending('Updating price', async () => {
      if (!isOwner) {
        throw new Error('Only the contract owner can update the price');
      }

      const nextPrice = BigInt(priceInput.trim());
      if (nextPrice <= 0) {
        throw new Error('Price must be greater than zero');
      }

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect your wallet first');
      }

      const contract = new Contract(SIMPLE_SWAP.address, SIMPLE_SWAP.abi, signer);
      const tx = await contract.setPrice(nextPrice);
      await tx.wait();
      setStatusMessage(`Price updated to ${nextPrice.toString()} Zama per mockETH.`);
      await refetchPrice();
      setPriceInput('');
    });

  const handleSwapEthForZama = () =>
    withPending('Swapping mockETH for mockZama', async () => {
      if (!address) {
        throw new Error('Connect your wallet first');
      }
      if (!instance) {
        throw new Error('Encryption service is not ready yet');
      }

      const amount = parseAmountInput(ethAmount);
      const input = instance.createEncryptedInput(SIMPLE_SWAP.address, address);
      input.add64(ensureSafeNumber(amount));
      const encrypted = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect your wallet first');
      }

      const contract = new Contract(SIMPLE_SWAP.address, SIMPLE_SWAP.abi, signer);
      const tx = await contract.swapEthForZama(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatusMessage(`Swapped ${ethAmount} mockETH successfully.`);
      setEthAmount('');
    });

  const handleSwapZamaForEth = () =>
    withPending('Swapping mockZama for mockETH', async () => {
      if (!address) {
        throw new Error('Connect your wallet first');
      }
      if (!instance) {
        throw new Error('Encryption service is not ready yet');
      }

      const amount = parseAmountInput(zamaAmount);
      const input = instance.createEncryptedInput(SIMPLE_SWAP.address, address);
      input.add64(ensureSafeNumber(amount));
      const encrypted = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Connect your wallet first');
      }

      const contract = new Contract(SIMPLE_SWAP.address, SIMPLE_SWAP.abi, signer);
      const tx = await contract.swapZamaForEth(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();
      setStatusMessage(`Swapped ${zamaAmount} mockZama successfully.`);
      setZamaAmount('');
    });

  return (
    <div className="swap-dashboard">
      <section className="info-card">
        <h2 className="card-title">Swap Overview</h2>
        <p className="card-description">
          Fixed price market between confidential tokens. Current rate:
        </p>
        <div className="price-display">
          <span className="price-value">{formattedPrice}</span>
          <span className="price-label">Zama per 1 mockETH</span>
        </div>
        <div className="address-grid">
          <div>
            <span className="address-label">SimpleSwap</span>
            <span className="address-value">{SIMPLE_SWAP.address}</span>
          </div>
          <div>
            <span className="address-label">mockETH</span>
            <span className="address-value">{MOCK_ETH.address}</span>
          </div>
          <div>
            <span className="address-label">mockZama</span>
            <span className="address-value">{MOCK_ZAMA.address}</span>
          </div>
        </div>
        {ownerAddress && (
          <p className="owner-line">
            Contract owner: <span>{ownerAddress}</span>
          </p>
        )}
      </section>

      <section className="actions-grid">
        <div className="action-card">
          <h3 className="action-title">Mint Tokens</h3>
          <p className="action-description">Get fresh mock assets for testing and swaps.</p>
          <div className="button-row">
            <button
              className="primary-button"
              onClick={() => handleMint('mockETH')}
              disabled={pendingAction !== null}
            >
              Mint mockETH
            </button>
            <button
              className="primary-button"
              onClick={() => handleMint('mockZama')}
              disabled={pendingAction !== null}
            >
              Mint mockZama
            </button>
          </div>
        </div>

        <div className="action-card">
          <h3 className="action-title">Enable Operator</h3>
          <p className="action-description">
            Allow SimpleSwap to move your confidential tokens for 24 hours.
          </p>
          <div className="button-row">
            <button
              className="secondary-button"
              onClick={() => handleSetOperator('mockETH')}
              disabled={pendingAction !== null}
            >
              Grant mockETH
            </button>
            <button
              className="secondary-button"
              onClick={() => handleSetOperator('mockZama')}
              disabled={pendingAction !== null}
            >
              Grant mockZama
            </button>
          </div>
        </div>

        <div className="action-card">
          <h3 className="action-title">Owner Controls</h3>
          <p className="action-description">Update the fixed price when connected as owner.</p>
          <div className="form-row">
            <input
              type="number"
              className="text-input"
              value={priceInput}
              onChange={event => setPriceInput(event.target.value)}
              placeholder="New price"
              min={1}
            />
            <button
              className="primary-button"
              onClick={handleSetPrice}
              disabled={!isOwner || pendingAction !== null}
            >
              Update Price
            </button>
          </div>
          {!isOwner && <p className="helper-text">Connect with the owner wallet to edit the price.</p>}
        </div>
      </section>

      <section className="swap-grid">
        <div className="swap-card">
          <h3 className="action-title">Swap mockETH → mockZama</h3>
          <p className="action-description">Encrypted swap using the current price.</p>
          <input
            type="text"
            className="text-input"
            placeholder="Amount in mockETH (max 6 decimals)"
            value={ethAmount}
            onChange={event => setEthAmount(event.target.value)}
          />
          <button
            className="primary-button"
            onClick={handleSwapEthForZama}
            disabled={pendingAction !== null || zamaLoading}
          >
            Swap to mockZama
          </button>
        </div>

        <div className="swap-card">
          <h3 className="action-title">Swap mockZama → mockETH</h3>
          <p className="action-description">Return Zama liquidity for mockETH.</p>
          <input
            type="text"
            className="text-input"
            placeholder="Amount in mockZama (max 6 decimals)"
            value={zamaAmount}
            onChange={event => setZamaAmount(event.target.value)}
          />
          <button
            className="primary-button"
            onClick={handleSwapZamaForEth}
            disabled={pendingAction !== null || zamaLoading}
          >
            Swap to mockETH
          </button>
        </div>
      </section>

      <section className="status-section">
        {zamaLoading && <p className="helper-text">Initialising encryption service...</p>}
        {zamaError && <p className="error-text">{zamaError}</p>}
        {pendingAction && <p className="helper-text">{pendingAction}...</p>}
        {statusMessage && <p className="success-text">{statusMessage}</p>}
        {errorMessage && <p className="error-text">{errorMessage}</p>}
      </section>
    </div>
  );
}
