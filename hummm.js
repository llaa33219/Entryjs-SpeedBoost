// Entry.js 반복문 제한 해제 코드
(function() {
    console.log('Entry.js 반복문 제한 해제 중...');
    
    // 1. Entry.isTurbo를 강제로 true로 설정
    if (typeof Entry !== 'undefined') {
        Entry.isTurbo = true;
        console.log('✓ Entry.isTurbo = true 설정 완료');
        
        // 2. tickTime을 매우 큰 값으로 설정하여 시간 제한 우회
        Entry.tickTime = 999999999; // 약 11일
        console.log('✓ Entry.tickTime을 매우 큰 값으로 설정 완료');
        
        // 3. Code 클래스의 tick 메서드를 오버라이드하여 시간 체크 무력화
        if (Entry.engine && Entry.engine.code) {
            const originalTick = Entry.engine.code.tick;
            Entry.engine.code.tick = function() {
                // isUpdateTime을 항상 현재 시간으로 설정하여 시간 제한 우회
                this.isUpdateTime = performance.now();
                
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
                
                // 반복문 실행 시간 제한 완전 제거
                if (Entry.isTurbo) {
                    for (let i = 0; i < loopExecutor.length; i++) {
                        const executor = loopExecutor[i];
                        if (executor.isPause()) {
                            continue;
                        } else if (!executor.isEnd()) {
                            const { view } = executor.scope.block || {};
                            _executeEvent(view);
                            result = executor.execute(true);
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
                        
                        // 시간 체크 제거 - 무한 루프 가능
                        // 원래 코드: if (i === loopExecutor.length - 1 && Entry.tickTime > performance.now() - this.isUpdateTime) { i = -1; }
                        if (i === loopExecutor.length - 1) {
                            i = -1; // 시간 제한 없이 계속 반복
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
        
        console.log('🚀 반복문 제한 해제 완료! 이제 반복문이 1프레임에 여러 번 실행될 수 있습니다.');
        console.log('⚠️ 주의: 무한루프 사용 시 브라우저가 응답하지 않을 수 있습니다.');
        
    } else {
        console.error('❌ Entry 객체를 찾을 수 없습니다. Entry.js가 로드되었는지 확인하세요.');
    }
})();
