import {
	Disposable,
	InputBox,
	QuickInputButton,
	QuickInputButtons,
	window,
} from 'vscode';

type GettableValue = string | ((stepper: MultiStepper) => string);

export class MultiStepEntry {
	public constructor(
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
				buttons?: {
					button: QuickInputButton;
					callback: () => void;
				}[];
			}>;
			isPassword?: boolean;
		}
	) {}

	public static getGettable(
		stepper: MultiStepper,
		gettableValue?: GettableValue
	): string | undefined {
		if (!gettableValue) {
			return gettableValue;
		}
		if (typeof gettableValue === 'string') {
			return gettableValue;
		}

		return gettableValue(stepper);
	}

	public setInputSettings(stepper: MultiStepper, input: InputBox): void {
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
			input.buttons = stepper.getButtons();
			input.show();
			return true;
		}

		input.validationMessage = result.message;
		const buttons = result.buttons ?? [];
		for (const button of buttons) {
			stepper.buttonHandlers.set(button.button, button.callback);
		}
		input.buttons = [
			...stepper.getButtons(),
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

	public getButtons(
		stepIndex: number = this._currentStepIndex
	): QuickInputButton[] {
		return stepIndex > 0 ? [QuickInputButtons.Back] : [];
	}

	public constructor(private readonly _steps: MultiStepEntry[]) {
		this._values = this._steps.map((step) => {
			return (
				MultiStepEntry.getGettable(this, step.settings.value) ??
				undefined
			);
		});
	}

	private _runStep(input: InputBox, stepIndex: number): void {
		this._currentStepIndex = stepIndex;
		const step = this._currentStep;
		input.step = stepIndex + 1;
		step.setInputSettings(this, input);
		input.buttons = this.getButtons(stepIndex);
	}

	private _prevStep(input: InputBox): void {
		this._runStep(input, this._currentStepIndex - 1);
	}

	private _nextStep(input: InputBox): void {
		if (this._currentStepIndex + 1 < this._steps.length) {
			this._runStep(input, this._currentStepIndex + 1);
		} else {
			// Done :)
			this.dispose();
			this._resolveRunPromise?.(this._values);
			input.hide();
		}
	}

	public run(): Promise<undefined | (string | undefined)[]> {
		this._runPromise = new Promise((resolve) => {
			this._resolveRunPromise = resolve;
		});
		const input = window.createInputBox();

		input.totalSteps = this._steps.length;
		input.ignoreFocusOut = true;
		this._disposables.push(
			input.onDidTriggerButton((e) => {
				if (e === QuickInputButtons.Back) {
					this._prevStep(input);
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
					this._nextStep(input);
				}
			})
		);

		this._runStep(input, 0);
		input.show();

		return this._runPromise;
	}

	public dispose(): void {
		this._disposables.forEach((d) => void d.dispose());
	}
}
