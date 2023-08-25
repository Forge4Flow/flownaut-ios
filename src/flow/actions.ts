import './config';
import * as fcl from '@onflow/fcl';
import { browser } from '$app/environment';
import { user } from '$stores/flow/FlowStore';
import { executeTransaction, getContractNameFromContractCode } from './utils';
import { env as PublicEnv } from '$env/dynamic/public';
import type { TransactionStatusObject } from '@onflow/fcl';
import type { ActionExecutionResult } from '$lib/stores/custom/steps/step.interface';
import { get } from 'svelte/store';
import { Buffer } from 'buffer';

import getEmeraldIDScript from './cadence/scripts/get_emerald_id.cdc?raw';

if (browser) {
	// set Svelte $user store to currentUser,
	// so other components can access it
	fcl.currentUser.subscribe(user.set, []);
}

// Lifecycle FCL Auth functions
export const unauthenticate = () => fcl.unauthenticate();
export const logIn = async () => await fcl.logIn();
export const signUp = () => fcl.signUp();

async function createNewInstance(challengeId: string) {
	console.log(`Deploying new ${challengeId} contract...`)
	const contractCode = (await import(`../lib/content/flownaut/${challengeId}/en/contract.cdc?raw`)).default;
	const hexCode = Buffer.from(contractCode).toString('hex');
	const contractName = getContractNameFromContractCode(contractCode);

	return await fcl.mutate({
		cadence: `
		transaction(publicKey: String, contractCode: String, contractName: String) {
			prepare(signer: AuthAccount) {
				let key = PublicKey(
					publicKey: publicKey.decodeHex(),
					signatureAlgorithm: SignatureAlgorithm.ECDSA_P256
				)

				let account = AuthAccount(payer: signer)

				account.keys.add(
					publicKey: key,
					hashAlgorithm: HashAlgorithm.SHA3_256,
					weight: 1000.0
				)

				account.contracts.add(
					name: contractName,
					code: contractCode.decodeHex()
				)
			}
		}
		`,
		args: (arg, t) => [
			arg(PublicEnv.PUBLIC_TESTNET_ACCOUNT_PUBLIC_KEY, t.String),
			arg(hexCode, t.String),
			arg(contractName, t.String)
		],
		// the person paying for the tx
		payer: fcl.authz,
		// the person proposing the tx (uses their public key to send the tx)
		proposer: fcl.authz,
		// the person authorizing the tx (gets put as an `AuthAccount` in prepare phase)
		authorizations: [fcl.authz],
		limit: 999
	});
}

export const createNewInstanceExecution = (challengeId: string, actionAfterSucceed: (res: TransactionStatusObject) => Promise<ActionExecutionResult>) =>
	executeTransaction(() => createNewInstance(challengeId), actionAfterSucceed);

export const getEmeraldID = async (address: string) => {
	try {
		const response = await fcl.query({
			cadence: getEmeraldIDScript,
			args: (arg, t) => [arg(address, t.Address)]
		});
		return response;
	} catch (e) {
		return null;
	}
};
