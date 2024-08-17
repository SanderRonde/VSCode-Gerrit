import {
	Disposable,
	InputBox,
	QuickInputButton,
	QuickInputButtons,
	window,
} from 'vscode';

type GettableValue<V extends string | object> =
	| V
	| ((stepper: MultiStepper) => V | Promise<V>);

export class MultiStepEntry {
	public constructor(
		public settings: {
			placeHolder?: GettableValue<string>;
			prompt?: GettableValue<string>;
			value?: GettableValue<string>;
			buttons?: GettableValue<
				{
					button: QuickInputButton;
					callback: () => void;
				}[]
			>;
			validate?: (
				value: string,
				stepper: MultiStepper
			) => Promise<{
				isValid: boolean;
				message?: string;
				buttons?: {
					button: QuickInputButton;
					callback: () => void;
				}[];
			}>;
			isPassword?: boolean;
		}
	) {}

	public static async getGettable<V extends string | object>(
		stepper: MultiStepper,
		gettableValue?: GettableValue<V>
	): Promise<V | undefined> {
		if (!gettableValue) {
			return gettableValue;
		}
		if (typeof gettableValue === 'function') {
			return (await gettableValue(stepper)) as V;
		}
		return gettableValue;
	}

	public async setInputSettings(
		stepper: MultiStepper,
		input: InputBox
	): Promise<void> {
		input.placeholder = await MultiStepEntry.getGettable(
			stepper,
			this.settings.placeHolder
		);
		input.prompt = await MultiStepEntry.getGettable(
			stepper,
			this.settings.prompt
		);
		input.value =
			(await MultiStepEntry.getGettable(stepper, this.settings.value)!) ??
			'';
		input.password = !!this.settings.isPassword;
		input.validationMessage = undefined;
	}

	public async validate(
		stepper: MultiStepper,
		input: InputBox,
		value: string
	): Promise<boolean> {
		if (!this.settings.validate) {
			return true;
		}

		input.enabled = false;
		input.busy = true;
		input.show();

		const result = await this.settings.validate(value, stepper);

		input.enabled = true;
		input.busy = false;
		input.show();

		if (result.isValid) {
			input.validationMessage = undefined;
			input.buttons = await stepper.getButtons();
			input.show();
			return true;
		}

		input.validationMessage = result.message;
		const buttons = result.buttons ?? [];
		for (const button of buttons) {
			stepper.buttonHandlers.set(button.button, button.callback);
		}
		input.buttons = [
			...(await stepper.getButtons()),
			...buttons.map((b) => b.button),
		];
		input.show();
		return false;
	}
}

export class MultiStepper {
	private _currentStepIndex = 0;
	private _disposables: Disposable[] = [];
	private _values: (string | undefined)[] = [];
	private _runPromise: Promise<(string | undefined)[] | undefined> | null =
		null;
	private _resolveRunPromise:
		| null
		| ((value: (string | undefined)[] | undefined) => void) = null;
	public buttonHandlers = new WeakMap<QuickInputButton, () => void>();

	private get _currentStep(): MultiStepEntry {
		return this._steps[this._currentStepIndex];
	}

	public get values(): (string | undefined)[] {
		return this._values;
	}

	public async getButtons(
		stepIndex: number = this._currentStepIndex
	): Promise<QuickInputButton[]> {
		const buttons = [];
		if (stepIndex > 0) {
			buttons.push(QuickInputButtons.Back);
		}
		const step = this._steps[stepIndex];
		const stepButtons = step.settings.buttons
			? (await MultiStepEntry.getGettable(this, step.settings.buttons)) ??
				[]
			: [];
		if (step.settings.buttons) {
			for (const { button, callback } of stepButtons) {
				this.buttonHandlers.set(button, callback);
				buttons.push(button);
			}
		}
		return buttons;
	}

	public constructor(private readonly _steps: MultiStepEntry[]) {}

	private async _runStep(input: InputBox, stepIndex: number): Promise<void> {
		this._currentStepIndex = stepIndex;
		const step = this._currentStep;
		input.step = stepIndex + 1;
		await step.setInputSettings(this, input);
		input.buttons = await this.getButtons(stepIndex);
	}

	private _prevStep(input: InputBox): Promise<void> {
		return this._runStep(input, this._currentStepIndex - 1);
	}

	private async _nextStep(input: InputBox): Promise<void> {
		if (this._currentStepIndex + 1 < this._steps.length) {
			await this._runStep(input, this._currentStepIndex + 1);
		} else {
			// Done :)
			this.dispose();
			this._resolveRunPromise?.(this._values);
			input.hide();
		}
	}

	public async run(): Promise<undefined | (string | undefined)[]> {
		this._values = await Promise.all(
			this._steps.map(async (step) => {
				return (
					(await MultiStepEntry.getGettable(
						this,
						step.settings.value
					)) ?? undefined
				);
			})
		);

		this._runPromise = new Promise((resolve) => {
			this._resolveRunPromise = resolve;
		});
		const input = window.createInputBox();

		input.totalSteps = this._steps.length;
		input.ignoreFocusOut = true;
		this._disposables.push(
			input.onDidTriggerButton((e) => {
				if (e === QuickInputButtons.Back) {
					void this._prevStep(input);
				} else {
					const handler = this.buttonHandlers.get(e);
					if (handler) {
						handler();
					}
				}
			})
		);
		this._disposables.push(
			input.onDidHide(() => {
				this.dispose();
				this._resolveRunPromise?.(undefined);
			})
		);
		this._disposables.push(
			input.onDidAccept(async () => {
				if (
					await this._currentStep.validate(this, input, input.value)
				) {
					this._values[this._currentStepIndex] = input.value;
					await this._nextStep(input);
				}
			})
		);

		await this._runStep(input, 0);
		input.show();

		return this._runPromise;
	}

	public dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}
