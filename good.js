// Entry.js 고급 실행 제한 조정 도구
(function() {
    console.log('🚀 Entry.js 고급 실행 제한 조정 도구 초기화 중...');
    
    // 설정 객체 생성
    if (typeof Entry === 'undefined') {
        console.error('❌ Entry 객체를 찾을 수 없습니다. Entry.js가 로드되었는지 확인하세요.');
        return;
    }
    
    // 실행 제한 설정을 위한 전역 객체 생성
    window.EntryExecutionConfig = {
        // 반복문 설정
        loopSettings: {
            enabled: true,                    // 반복문 제한 활성화 여부
            maxExecutionsPerFrame: 1000,     // 프레임당 최대 반복 실행 횟수
            timePerFrame: 16.67              // 프레임당 시간 (ms)
        },
        // 함수 호출 설정
        functionSettings: {
            maxCallStackDepth: Infinity,     // 최대 함수 호출 깊이 (기본: 무제한)
            enableRecursionCheck: false      // 재귀 호출 체크 활성화 여부
        },
        // 전역 실행 설정
        globalSettings: {
            turboMode: true,                 // 터보 모드 강제 활성화
            unlimitedExecution: false,       // 완전 무제한 실행 모드
            executionSpeed: 'max'            // 'normal', 'fast', 'max'
        }
    };
    
    console.log('✓ 설정 객체 생성 완료');
    
    // 원본 메서드들 백업
    const originalMethods = {
        codeTick: null,
        executorExecute: null,
        executor2Execute: null,
        funcExecute: null
    };
    
    // 1. Entry.isTurbo 설정
    Entry.isTurbo = window.EntryExecutionConfig.globalSettings.turboMode;
    console.log('✓ Entry.isTurbo 설정 완료:', Entry.isTurbo);
    
    // 2. Entry.tickTime 동적 조정
    Entry.tickTime = window.EntryExecutionConfig.loopSettings.timePerFrame;
    console.log('✓ Entry.tickTime 설정 완료:', Entry.tickTime, 'ms');
    
    // 3. Code.tick 메서드 오버라이드 (반복문 제한 조정)
    if (Entry.engine && Entry.engine.code) {
        originalMethods.codeTick = Entry.engine.code.tick;
        Entry.engine.code.tick = function() {
            const config = window.EntryExecutionConfig;
            
            if (config.loopSettings.enabled && !this.isUpdateTime) {
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
            
            // 일반 실행자들 처리
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
            
            // 반복문 실행자들 처리 (설정 가능)
            if (Entry.isTurbo && loopExecutor.length > 0) {
                let executionCount = 0;
                const maxExecutions = config.loopSettings.maxExecutionsPerFrame;
                const unlimitedMode = config.globalSettings.unlimitedExecution;
                
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
                    
                    // 실행 제한 체크 (설정에 따라 조정)
                    if (i === loopExecutor.length - 1) {
                        if (unlimitedMode) {
                            // 무제한 모드: 계속 실행
                            i = -1;
                        } else if (config.loopSettings.enabled) {
                            // 설정된 횟수만큼 실행
                            if (executionCount >= maxExecutions) {
                                break;
                            }
                            i = -1;
                        } else {
                            // 시간 기반 제한 (원래 로직)
                            if (Entry.tickTime > performance.now() - this.isUpdateTime) {
                                i = -1;
                            }
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
        console.log('✓ Code.tick 메서드 오버라이드 완료');
    }
    
    // 4. 함수 호출 스택 제한 오버라이드
    const originalCallStackCheck = Entry.callStackLength;
    Object.defineProperty(Entry, 'callStackLength', {
        get: function() {
            return this._callStackLength || 0;
        },
        set: function(value) {
            const config = window.EntryExecutionConfig.functionSettings;
            
            if (!config.enableRecursionCheck) {
                // 재귀 체크 비활성화 시 항상 0으로 유지
                this._callStackLength = 0;
                return;
            }
            
            if (value > config.maxCallStackDepth) {
                if (config.maxCallStackDepth !== Infinity) {
                    throw new RangeError('함수 호출 깊이 제한 초과');
                }
            }
            this._callStackLength = value;
        }
    });
    console.log('✓ 함수 호출 스택 제한 오버라이드 완료');
    
    // 5. Executor 클래스들의 RangeError 처리 오버라이드
    function overrideExecutorErrorHandling(ExecutorClass) {
        if (!ExecutorClass || !ExecutorClass.prototype.execute) return;
        
        const originalExecute = ExecutorClass.prototype.execute;
        ExecutorClass.prototype.execute = function(isFromOrigin) {
            try {
                return originalExecute.call(this, isFromOrigin);
            } catch (e) {
                // RangeError (재귀 호출 제한) 무시
                if (e.name === 'RangeError' && !window.EntryExecutionConfig.functionSettings.enableRecursionCheck) {
                    console.log('⚠️ RangeError 무시됨 (재귀 호출 제한 비활성화)');
                    return { promises: [], blocks: [] };
                }
                throw e;
            }
        };
    }
    
    // Executor 클래스들에 적용
    if (typeof Executor !== 'undefined') {
        overrideExecutorErrorHandling(Executor);
    }
    console.log('✓ Executor 오류 처리 오버라이드 완료');
    
    // 6. 설정 변경 함수들 제공
    window.EntryExecutionConfig.setLoopLimit = function(maxExecutions) {
        this.loopSettings.maxExecutionsPerFrame = maxExecutions;
        console.log('✓ 반복문 프레임당 실행 횟수 설정:', maxExecutions);
    };
    
    window.EntryExecutionConfig.setUnlimitedMode = function(enabled) {
        this.globalSettings.unlimitedExecution = enabled;
        if (enabled) {
            this.loopSettings.enabled = false;
            this.functionSettings.enableRecursionCheck = false;
        }
        console.log('✓ 무제한 실행 모드:', enabled ? '활성화' : '비활성화');
    };
    
    window.EntryExecutionConfig.setFunctionDepthLimit = function(maxDepth) {
        this.functionSettings.maxCallStackDepth = maxDepth;
        this.functionSettings.enableRecursionCheck = maxDepth !== Infinity;
        console.log('✓ 함수 호출 깊이 제한 설정:', maxDepth);
    };
    
    window.EntryExecutionConfig.reset = function() {
        // 원본 메서드들 복원
        if (originalMethods.codeTick && Entry.engine && Entry.engine.code) {
            Entry.engine.code.tick = originalMethods.codeTick;
        }
        Entry.isTurbo = false;
        Entry.tickTime = Math.floor(1000 / (Entry.FPS || 60));
        console.log('✓ 모든 설정이 원래대로 복원되었습니다.');
    };
    
    // 7. 사용법 안내
    console.log('🎉 Entry.js 고급 실행 제한 조정 도구 설치 완료!');
    console.log('');
    console.log('📖 사용법:');
    console.log('EntryExecutionConfig.setLoopLimit(1000)        // 프레임당 반복 1000회');
    console.log('EntryExecutionConfig.setLoopLimit(Infinity)    // 반복문 무제한');
    console.log('EntryExecutionConfig.setUnlimitedMode(true)    // 모든 제한 해제');
    console.log('EntryExecutionConfig.setFunctionDepthLimit(100) // 함수 깊이 100으로 제한');
    console.log('EntryExecutionConfig.setFunctionDepthLimit(Infinity) // 함수 깊이 무제한');
    console.log('EntryExecutionConfig.reset()                  // 모든 설정 초기화');
    console.log('');
    console.log('🔧 현재 설정:', window.EntryExecutionConfig);
    console.log('');
    console.log('⚠️ 주의: 무제한 모드 사용 시 브라우저가 응답하지 않을 수 있습니다.');
    
})();
