import { Disposable, InputBox, QuickInputButtons, window } from 'vscode';

type GettableValue = string | ((stepper: MultiStepper) => string);

export class MultiStepEntry {
	constructor(
		public settings: {
			placeHolder?: GettableValue;
			prompt?: GettableValue;
			value?: GettableValue;
			validate?: (
				value: string,
				stepper: MultiStepper
			) => Promise<{
				isValid: boolean;
				message?: string;
			}>;
			isPassword?: boolean;
		}
	) {}

	public static getGettable(
		stepper: MultiStepper,
		gettableValue?: GettableValue
	) {
		if (!gettableValue) {
			return gettableValue;
		}
		if (typeof gettableValue === 'string') {
			return gettableValue;
		}

		return gettableValue(stepper);
	}

	setInputSettings(stepper: MultiStepper, input: InputBox) {
		input.placeholder = MultiStepEntry.getGettable(
			stepper,
			this.settings.placeHolder
		);
		input.prompt = MultiStepEntry.getGettable(
			stepper,
			this.settings.prompt
		);
		input.value =
			MultiStepEntry.getGettable(stepper, this.settings.value)! ?? '';
		input.password = !!this.settings.isPassword;
	}

	async validate(
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
			input.show();
			return true;
		}

		input.validationMessage = result.message;
		input.show();
		return false;
	}
}

export class MultiStepper {
	private _currentStepIndex: number = 0;
	private _disposables: Disposable[] = [];
	private _values: (string | undefined)[] = [];
	private _runPromise: Promise<(string | undefined)[] | undefined> | null =
		null;
	private _resolveRunPromise:
		| null
		| ((value: (string | undefined)[] | undefined) => void) = null;

	constructor(private _steps: MultiStepEntry[]) {
		this._values = this._steps.map((step) => {
			return (
				MultiStepEntry.getGettable(this, step.settings.value) ??
				undefined
			);
		});
	}

	run() {
		this._runPromise = new Promise((resolve) => {
			this._resolveRunPromise = resolve;
		});
		const input = window.createInputBox();

		input.totalSteps = this._steps.length;
		input.ignoreFocusOut = true;
		this._disposables.push(
			input.onDidTriggerButton(async (e) => {
				if (e === QuickInputButtons.Back) {
					this.prevStep(input);
				}
			})
		);
		this._disposables.push(
			input.onDidHide(async () => {
				this.dispose();
				this._resolveRunPromise?.(undefined);
			})
		);
		this._disposables.push(
			input.onDidAccept(async () => {
				if (await this.currentStep.validate(this, input, input.value)) {
					this._values[this._currentStepIndex] = input.value;
					this.nextStep(input);
				}
			})
		);

		this.runStep(input, 0);
		input.show();

		return this._runPromise;
	}

	get currentStep() {
		return this._steps[this._currentStepIndex];
	}

	get values() {
		return this._values;
	}

	runStep(input: InputBox, stepIndex: number) {
		this._currentStepIndex = stepIndex;
		const step = this.currentStep;
		input.step = stepIndex + 1;
		step.setInputSettings(this, input);
		input.buttons = stepIndex > 0 ? [QuickInputButtons.Back] : [];
	}

	prevStep(input: InputBox) {
		this.runStep(input, this._currentStepIndex - 1);
	}

	nextStep(input: InputBox) {
		if (this._currentStepIndex + 1 < this._steps.length) {
			this.runStep(input, this._currentStepIndex + 1);
		} else {
			// Done :)
			this.dispose();
			this._resolveRunPromise?.(this._values);
			input.hide();
		}
	}

	dispose() {
		this._disposables.forEach((d) => d.dispose());
	}
}
