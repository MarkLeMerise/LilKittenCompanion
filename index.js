($ => {
    class AsyncTask {
        constructor(settings) {
            this.__changeListener = () => {};
            this.settings = Object.assign({ isActive: false }, settings);
            this.name = settings.name;
            this.icon = settings.icon;
            this.$toggle = $(`
                <div class="task">
                    <span class="task-label">${ this.icon } ${ this.label }</span>
                    <span class="task-status">▶️</span>
                </div>
            `);
            this.$toggle.find('.task-status').on('click', () => this.isActive ? this.pause() : this.start());
        }

        get isActive() {
            return this.settings.isActive;
        }

        get label() {
            return this.settings.label;
        }

        /**
         * Updates the task controls to reflect the active state
         * @param {boolean} isActive
         * @private
         */
        __setIsActive(isActive) {
            this.updateSettings({ isActive });
            this.$toggle.find('.task-status').text(isActive ? '⏸' : '▶️');
            const statusAdjective = isActive ? 'started' : 'pawsed';
            this._log(`${ isActive ? '▶️' : '⏸' } Task ${ statusAdjective }.`);
        }

        /**
         * Log message branded for this task
         * @param {string} message
         * @protected
         */
        _log(message) {
            console.log(`${ this.icon } [${ this.label }] ${ message }`);
        }

        /**
         * Lifecycle hook to perform the main action of task
         * @param {any} args - Passes through arguments passed to execute()
         * @return {boolean | void} - Return false to cancel startup
         * @protected
         */
        _onExecute(args) {}

        /**
         * Lifecycle hook to perform task-specific side effects upon deactivation
         * @return {boolean | void} - Return false to cancel pausing
         * @protected
         */
        _onPause() {}

        /**
         * Lifecycle hook to perform task-specific actions on activation, generally some binding that calls execute()
         * @return {boolean | void} - Return false to cancel startup
         * @protected
         */
        _onStart() {}

        /**
         * Executes the task, calls `_onExecute` lifecycle hook
         * @public
         */
        execute() {
            this._onExecute(...arguments);
            this._log(this.getExecutionMessage());
        }

        /**
         * Message to log to the console when a task is executed.
         * Subclasses SHOULD override to create better logging & tracing.
         * @public
         */
        getExecutionMessage() {
            return 'Task executed!';
        }

        /**
         * Allows listening for changes to the task's state
         * @param {Function} listener — Called with new `settings` and `task` objects when settings are updated
         * @public
         */
        onChange(callback) {
            this.__changeListener = callback;
        }

        /**
         * Deactivate the task.
         * Calls the `_onPause` lifecycle hook.
         * @public
         */
        pause() {
            if (!this.isActive) { return; }

            if (this._onPause() !== false) {
                this.__setIsActive(false);
            }
        }

        /**
         * Activates the task.
         * Calls the `_onStart` lifecycle hook.
         * @public
         */
        start(settings) {
            if (settings && settings.isActive) {
                this.updateSettings(settings);
            } else if (this.isActive) {
                return;
            }

            if (this._onStart() !== false) {
                this.__setIsActive(true);
            } else {
                this.__setIsActive(false);
            }
        }

        /**
         * Update the state & configuration of the task
         * Consumers of the task MAY be notified of this change, so this state should be considered public
         * @param {object} settings - New settings to merge into the task
         * @public
         */
        updateSettings(settings) {
            Object.assign(this.settings, settings);
            this.__changeListener(this.settings, this);
        }
    }

    class PeriodicTask extends AsyncTask {
        constructor(settings, intervalInMinutes = 4) {
            super(Object.assign({ interval: intervalInMinutes * 60 }, settings));
            this.secondsSinceLastExecution = 0;

            // Generate toggle
            this.$toggle.find('.task-label').on('click', () => this.$toggle.toggleClass('show-incrementer'));
            const $incrementer = $('<input class="task-interval" type="number" max="60" min="1" step="1" />');
            $incrementer.val(intervalInMinutes);
            $incrementer.on('change', event => this.setInterval(event.currentTarget.value));
            this.$toggle.prepend($incrementer);
            this.$toggle.append('<small class="task-timer" />');
        }

        get interval() {
            return this.settings.interval;
        }

        _formatTime(timeInSeconds) {
            const minutes = Math.floor(timeInSeconds / 60);
            let seconds = Math.floor(timeInSeconds % 60);
            seconds = seconds < 10 ? '0' + seconds : seconds;
            return `${ minutes }:${ seconds }`;
        }

        _onPause() {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        _onStart() {
            this._setRemainingTime(this.interval - this.secondsSinceLastExecution);

            this.intervalId = setInterval(() => {
                this.secondsSinceLastExecution += 1;

                if (this.secondsSinceLastExecution >= this.interval) {
                    this.execute();
                    this.secondsSinceLastExecution = 0;
                }

                this._setRemainingTime(this.interval - this.secondsSinceLastExecution);
            }, 1000);
        }

        _setRemainingTime(timeInSeconds) {
            let output = '';

            if (timeInSeconds) {
                const formattedTime = this._formatTime(timeInSeconds);
                output = formattedTime;
            }

            this.$toggle.find('.task-timer').text(output);
        }

        getConfig() {
            return Object.assign(super.getConfig, {
                interval: this.interval,
                secondsSinceLastExecution: this.secondsSinceLastExecution
            });
        }

        setInterval(intervalInMinutes) {
            this.updateSettings({ interval: intervalInMinutes * 60 });
            this._log(`Interval changed to ${ this._formatTime(this.interval) }.`);
        }
    }

    class Autocrafter extends PeriodicTask {
        constructor(icon, name, label) {
            super({ icon, label: label || name, name });
        }

        _onExecute() {
            gamePage.craftAll(this.name);
        }

        getExecutionMessage() {
            return `${ this.name } crafted!`;
        }
    }

    class Autohunter extends PeriodicTask {
        constructor(icon, name) {
            super({ icon, label: name, name });
        }

        _onExecute() {
            gamePage.huntAll(new Event('hunt'));
        }

        getExecutionMessage() {
            return 'The kittens have hunted 🔪';
        }
    }

    class Autotrader extends PeriodicTask {
        constructor(icon, name) {
            super({ icon, label: name, name, selectedRace: null });

            const $options = gamePage.diplomacy.races
                .filter(r => r.unlocked)
                .map(r => r.name)
                .map(r => `<option name=${ r } value=${ r }>${ r }</option>`);

            $options.unshift('<option value="">Select a race</option>');
            this.$raceSelector = $('<select id="autotrade-race-selector" />')
                .on('change', e => this.updateSettings({ selectedRace: e.currentTarget.value }))
                .append($options);

            this.$toggle.append(this.$raceSelector);
        }

        get selectedRace() {
            return this.settings.selectedRace;
        }

        _onExecute() {
            gamePage.diplomacy.tradeAll(gamePage.diplomacy.get(this.selectedRace));
        }

        _onStart() {
            if (this.selectedRace) {
                super._onStart();
                this._log(`You're going to be periodically trading with ${ this.selectedRace }.`);
            } else {
                this._log('Can\'t start trading without first selecting a race to trade with.');
                return false;
            }
        }

        getExecutionMessage() {
            return `Traded with ${ this.selectedRace }`;
        }

        /**
         * Set the race <select> value when reloading options from memory
         * 
         * @param {object} settings 
         * @public
         * @override
         */
        updateSettings(settings) {
            super.updateSettings(settings);

            if ('selectedRace' in settings) {
                const { selectedRace } = settings;
                this.$raceSelector.val(selectedRace);
                this.$raceSelector.attr('disabled', !selectedRace);
                if (!selectedRace) { this.pause(); }
            }
        }
    }

    class Autopraiser extends PeriodicTask {
        constructor(icon, name) {
            super({ icon, label: name, name });
        }

        _onExecute() {
            gamePage.religion.praise();
        }

        getExecutionMessage() {
            return 'All hail ceiling cat! 🙀';
        }
    }

    class SkyObserver extends AsyncTask {
        constructor(icon, name) {
            super({ captureCount: 0, icon, label: name, name });
            this.$toggle.append('<small class="capture-count" />');
        }

        get captureCount() {
            return this.settings.captureCount;
        }

        _onExecute($btn) {
            this.updateSettings({ captureCount: this.captureCount + 1 });
            this.$toggle.find('.capture-count').text(`(${ this.captureCount })`);
            $btn.click();
        }

        _onStart() {
            const observer = new MutationObserver(() => {
                const $btn = document.querySelector('#observeBtn');
                if ($btn) { this.execute($btn); }
            });

            observer.observe(document.querySelector('#observeButton'), { childList: true });
            this.observer = observer;
        }

        _onPause() {
            this.observer.disconnect();
            this.observer = null;
        }

        getExecutionMessage() {
            return 'Meteor captured!';
        }
    }

    const loadTaskFromMemory = (task, settings) => {
        if (!settings) {
            console.warn(`[Autokittens] No settings found for task "${ task.name }" yet.`, task);
            return task.start();
        }

        if (settings.isActive) {
            task.start(settings);
        } else {
            task.updateSettings(settings);
        }
    };

    const tasks = [
        { name: 'wood', icon: '🌳' },
        { name: 'beam', icon: '🏗' },
        { name: 'slab', icon: '⛰' },
        { name: 'plate', icon: '🔗' },
        { name: 'steel', icon: '⚔️' },
        { name: 'kerosene', icon: '🛢' },
        { name: 'parchment', icon: '📝' },
        { name: 'manuscript', icon: '🗞' },
        { name: 'compedium', label: 'compendium', icon: '📖' },
        { name: 'blueprint', icon: '📘' }
    ].map(a => new Autocrafter(a.icon, a.name, a.label));

    tasks.push(new Autohunter('🐯', 'hunt'));
    tasks.push(new SkyObserver('☄️', 'sky'));
    tasks.push(new Autotrader('🤝', 'trade'));
    tasks.push(new Autopraiser('🙏', 'praise'));

    const $taskToggleContainer = $('<div class="task-toggle-container" />');

    // Start/stop all autocrafters
    const $startAll = $('<button>▶️ Start all</button>');
    const $stopAll = $('<button>⏸ Pawse all</button>');
    $taskToggleContainer.append($startAll);
    $taskToggleContainer.append($stopAll);
    $startAll.on('click', () => tasks.forEach(crafter => crafter.start()));
    $stopAll.on('click', () => tasks.forEach(crafter => crafter.pause()));

    // Add autocrafting buttons
    const CONFIG_STORAGE_KEY = 'autokittens.config';
    const allSettings = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY)) || {};

    tasks.forEach(task => {
        loadTaskFromMemory(task, allSettings[task.name]);
        task.onChange((taskSettings, task) => {
            allSettings[task.name] = taskSettings;
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(allSettings))
        });
        $taskToggleContainer.append(task.$toggle);
    });

    // Append entire widget and styling
    $('body').append($taskToggleContainer);
    $('head').append('<style>.task-toggle-container {position: absolute;background: black;padding: 0.5em;bottom: 5%;right: 1%;border-radius: 5px;}.task-status:hover{cursor:pointer}.task.show-incrementer .task-interval { display: inline-block; }.task .task-interval{ display: none; }</style>');
})(jQuery);