// Entry.js 실제 작동하는 실행 제한 해제 코드
(function() {
    console.log('🔧 Entry.js 실행 제한 해제 도구 v2.0 시작...');
    
    if (typeof Entry === 'undefined') {
        console.error('❌ Entry 객체를 찾을 수 없습니다.');
        return;
    }
    
    // 전역 설정 객체
    window.EntryLimitConfig = {
        loopExecutionsPerFrame: 1000,  // 프레임당 반복 실행 횟수
        unlimitedMode: false,          // 완전 무제한 모드
        originalMethods: {},           // 원본 메서드 백업
        isActive: false               // 활성화 상태
    };
    
    // 1. Entry.isTurbo 강제 활성화
    Entry.isTurbo = true;
    console.log('✓ Entry.isTurbo = true 설정 완료');
    
    // 2. Entry.tickTime 조정 (더 긴 시간으로 설정)
    Entry.tickTime = 999999; // 매우 큰 값으로 설정
    console.log('✓ Entry.tickTime =', Entry.tickTime, 'ms로 설정');
    
    // 3. Code.prototype.tick 메서드 직접 오버라이드
    if (Entry.Code && Entry.Code.prototype && Entry.Code.prototype.tick) {
        // 원본 메서드 백업
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
            
            // 반복문 실행자들 처리 (설정 가능한 제한)
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
                    
                    // 실행 횟수 제한 적용
                    if (i === loopExecutor.length - 1) {
                        if (config.unlimitedMode || maxExecutions === Infinity) {
                            // 무제한 모드: 계속 실행
                            i = -1;
                        } else if (executionCount < maxExecutions) {
                            // 설정된 횟수만큼 더 실행
                            i = -1;
                        }
                        // 제한에 도달하면 이번 프레임은 종료
                    }
                }
            }
            
            this.isUpdateTime = 0;
            shouldNotifyWatch && watchEvent.notify(executedBlocks);
            if (result && result.promises) {
                Entry.engine.addPromiseExecutor(result.promises);
            }
        };
        
        console.log('✓ Entry.Code.prototype.tick 오버라이드 완료');
        window.EntryLimitConfig.isActive = true;
    } else {
        console.error('❌ Entry.Code.prototype.tick을 찾을 수 없습니다.');
    }
    
    // 4. 함수 호출 스택 제한 해제
    const originalCallStackLength = Entry.callStackLength;
    Entry.callStackLength = 0; // 항상 0으로 유지
    
    // callStackLength에 대한 설정자/접근자 오버라이드
    if (Object.defineProperty) {
        try {
            Object.defineProperty(Entry, 'callStackLength', {
                get: function() {
                    return 0; // 항상 0 반환으로 스택 오버플로우 방지 우회
                },
                set: function(value) {
                    // 설정 무시
                },
                configurable: true
            });
            console.log('✓ 함수 호출 스택 제한 해제 완료');
        } catch (e) {
            console.warn('⚠️ callStackLength 오버라이드 실패:', e);
        }
    }
    
    // 5. 설정 변경 함수들
    window.EntryLimitConfig.setLoopLimit = function(count) {
        this.loopExecutionsPerFrame = count;
        console.log('✓ 반복 실행 횟수 설정:', count === Infinity ? '무제한' : count + '회');
        return this;
    };
    
    window.EntryLimitConfig.setUnlimitedMode = function(enabled) {
        this.unlimitedMode = enabled;
        if (enabled) {
            this.loopExecutionsPerFrame = Infinity;
            console.log('✓ 완전 무제한 모드 활성화');
        } else {
            console.log('✓ 제한 모드로 변경');
        }
        return this;
    };
    
    window.EntryLimitConfig.reset = function() {
        // 원본 메서드 복원
        if (this.originalMethods.tick && Entry.Code && Entry.Code.prototype) {
            Entry.Code.prototype.tick = this.originalMethods.tick;
            console.log('✓ tick 메서드 복원 완료');
        }
        
        // 기본값 복원
        Entry.isTurbo = false;
        Entry.tickTime = Math.floor(1000 / (Entry.FPS || 60));
        
        this.isActive = false;
        console.log('✓ 모든 설정 초기화 완료');
        return this;
    };
    
    window.EntryLimitConfig.status = function() {
        console.log('📊 현재 설정 상태:');
        console.log('- 활성화:', this.isActive);
        console.log('- 터보 모드:', Entry.isTurbo);
        console.log('- 프레임당 반복 횟수:', this.loopExecutionsPerFrame === Infinity ? '무제한' : this.loopExecutionsPerFrame);
        console.log('- 무제한 모드:', this.unlimitedMode);
        console.log('- Entry.tickTime:', Entry.tickTime, 'ms');
        return this;
    };
    
    // 단축 함수들
    window.setLoopLimit = window.EntryLimitConfig.setLoopLimit.bind(window.EntryLimitConfig);
    window.setUnlimitedLoop = () => window.EntryLimitConfig.setLoopLimit(Infinity);
    window.resetEntryLimits = window.EntryLimitConfig.reset.bind(window.EntryLimitConfig);
    
    console.log('🎉 Entry.js 실행 제한 해제 도구 설치 완료!');
    console.log('');
    console.log('📖 사용법:');
    console.log('setLoopLimit(500)        // 프레임당 500회 반복');
    console.log('setLoopLimit(Infinity)   // 무제한 반복');
    console.log('setUnlimitedLoop()       // 무제한 반복 (단축)');
    console.log('EntryLimitConfig.setUnlimitedMode(true)  // 완전 무제한');
    console.log('EntryLimitConfig.status()               // 현재 상태 확인');
    console.log('resetEntryLimits()       // 모든 설정 초기화');
    console.log('');
    console.log('⚡ 즉시 테스트:');
    console.log('setLoopLimit(1000); // 1000회로 설정');
    
    // 기본값으로 1000회 설정
    window.EntryLimitConfig.setLoopLimit(1000);
    
})();
