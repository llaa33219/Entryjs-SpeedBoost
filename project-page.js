// iframe 안에 JS 주입
let iframe = document.querySelector('iframe'); // 대상 iframe
let script = iframe.contentDocument.createElement('script');
script.textContent = `
// entryjs 실행 제한 해제 도구
(function() {
    if (typeof Entry === 'undefined') return;
    
    window.EntryLimitConfig = {
        loopExecutionsPerFrame: 1000,
        unlimitedMode: false,
        originalMethods: {},
        isActive: false
    };
    
    Entry.isTurbo = true;
    Entry.tickTime = 999999;
    
    if (Entry.Code && Entry.Code.prototype && Entry.Code.prototype.tick) {
        window.EntryLimitConfig.originalMethods.tick = Entry.Code.prototype.tick;
        
        Entry.Code.prototype.tick = function() {
            const config = window.EntryLimitConfig;
            
            if (Entry.isTurbo && !this.isUpdateTime) {
                this.isUpdateTime = performance.now();
            }
            
            const executors = this.executors;
            const watchEvent = this.watchEvent;
            const shouldNotifyWatch = watchEvent.hasListeners();
            let result;
            let executedBlocks = [];
            const loopExecutor = [];
            
            const _executeEvent = _.partial(Entry.dispatchEvent, 'blockExecute');
            const _executeEndEvent = _.partial(Entry.dispatchEvent, 'blockExecuteEnd');
            
            for (let i = 0; i < executors.length; i++) {
                const executor = executors[i];
                if (executor.isPause()) {
                    continue;
                } else if (!executor.isEnd()) {
                    const { view } = executor.scope.block || {};
                    _executeEvent(view);
                    result = executor.execute(true);
                    if (executor.isLooped) {
                        loopExecutor.push(executor);
                    }
                    if (shouldNotifyWatch) {
                        const { blocks } = result;
                        executedBlocks = executedBlocks.concat(blocks);
                    }
                } else if (executor.isEnd()) {
                    _executeEndEvent(this.board);
                    executors.splice(i--, 1);
                    if (_.isEmpty(executors)) {
                        this.executeEndEvent.notify();
                    }
                }
            }
            
            if (Entry.isTurbo && loopExecutor.length > 0) {
                let executionCount = 0;
                const maxExecutions = config.loopExecutionsPerFrame;
                
                for (let i = 0; i < loopExecutor.length; i++) {
                    const executor = loopExecutor[i];
                    if (executor.isPause()) {
                        continue;
                    } else if (!executor.isEnd()) {
                        const { view } = executor.scope.block || {};
                        _executeEvent(view);
                        result = executor.execute(true);
                        executionCount++;
                        
                        if (shouldNotifyWatch) {
                            const { blocks } = result;
                            executedBlocks = executedBlocks.concat(blocks);
                        }
                    } else if (executor.isEnd()) {
                        _executeEndEvent(this.board);
                        loopExecutor.splice(i--, 1);
                        if (_.isEmpty(loopExecutor)) {
                            this.executeEndEvent.notify();
                        }
                    }
                    
                    if (i === loopExecutor.length - 1) {
                        if (config.unlimitedMode || maxExecutions === Infinity) {
                            i = -1;
                        } else if (executionCount < maxExecutions) {
                            i = -1;
                        }
                    }
                }
            }
            
            this.isUpdateTime = 0;
            shouldNotifyWatch && watchEvent.notify(executedBlocks);
            if (result && result.promises) {
                Entry.engine.addPromiseExecutor(result.promises);
            }
        };
        
        window.EntryLimitConfig.isActive = true;
    }
    
    Entry.callStackLength = 0;
    if (Object.defineProperty) {
        try {
            Object.defineProperty(Entry, 'callStackLength', {
                get: () => 0,
                set: () => {},
                configurable: true
            });
        } catch (e) {}
    }
    
    window.EntryLimitConfig.setLoopLimit = function(count) {
        this.loopExecutionsPerFrame = count;
        return this;
    };
    
    window.EntryLimitConfig.setUnlimitedMode = function(enabled) {
        this.unlimitedMode = enabled;
        if (enabled) this.loopExecutionsPerFrame = Infinity;
        return this;
    };
    
    window.EntryLimitConfig.reset = function() {
        if (this.originalMethods.tick && Entry.Code && Entry.Code.prototype) {
            Entry.Code.prototype.tick = this.originalMethods.tick;
        }
        Entry.isTurbo = false;
        Entry.tickTime = Math.floor(1000 / (Entry.FPS || 60));
        this.isActive = false;
        return this;
    };
    
    window.setLoopLimit = window.EntryLimitConfig.setLoopLimit.bind(window.EntryLimitConfig);
    window.setUnlimitedLoop = () => window.EntryLimitConfig.setLoopLimit(Infinity);
    window.resetEntryLimits = window.EntryLimitConfig.reset.bind(window.EntryLimitConfig);
    
    window.EntryLimitConfig.setLoopLimit(1000);
})();
`;
iframe.contentDocument.head.appendChild(script);
