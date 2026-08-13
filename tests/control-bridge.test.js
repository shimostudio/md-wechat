import test from 'node:test'
import assert from 'node:assert/strict'
import { claimBrowser, createBridgeState, finishPublishTask, getPublishTaskStatus, queuePublishTask, takePublishTask } from '../server/control-bridge.js'

test('控制桥同一时间只允许一个本地排版页面持有者', () => {
  const state = createBridgeState()
  assert.deepEqual(claimBrowser(state, 'client-a', { force: false }), { clientId: 'client-a', claimed: true })
  assert.throws(
    () => claimBrowser(state, 'client-b', { force: false }),
    /已有其他本地排版页面连接/
  )
  assert.deepEqual(claimBrowser(state, 'client-b', { force: true }), { clientId: 'client-b', claimed: true })
})

test('控制桥允许同一个页面重复声明连接', () => {
  const state = createBridgeState()
  claimBrowser(state, 'client-a', { force: false })
  assert.deepEqual(claimBrowser(state, 'client-a', { force: false }), { clientId: 'client-a', claimed: true })
})

test('发布任务按平台领取并在回传结果后清空', () => {
  const state = createBridgeState()
  const task = queuePublishTask(state, { platform: 'wechat', expectedTitle: '测试文章' })
  assert.equal(takePublishTask(state, 'douyin'), null)
  const claimed = takePublishTask(state, 'wechat')
  assert.equal(claimed.id, task.id)
  assert.equal(takePublishTask(state, 'wechat'), null)
  const result = finishPublishTask(state, task.id, { saved: true })
  assert.equal(result.saved, true)
  assert.equal(state.publishTask, null)
  assert.equal(getPublishTaskStatus(state, task.id).status, 'completed')
})
