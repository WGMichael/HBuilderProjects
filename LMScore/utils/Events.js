

class EventBus {
	constructor() {
		this.events = {};
	}

	/**
	* 监听事件
	* @param {string} event 事件名称
	* @param {Function} callback 回调函数
	*/
	on(event, callback) {
		if (!this.events[event]) {
			this.events[event] = [];
		}
		this.events[event].push(callback);
	}

	/**
	* 取消监听
	* @param {string} event 事件名称
	* @param {Function} callback 要移除的回调函数
	*/
	off(event, callback) {
		if (!this.events[event]) return;
		this.events[event] = this.events[event].filter(cb => cb !== callback);
	}

	/**
	* 只监听一次
	* @param {string} event 事件名称
	* @param {Function} callback 回调函数
	*/
	once(event, callback) {
		const wrapper = (...args) => {
			callback(...args);
			this.off(event, wrapper);
		};
		this.on(event, wrapper);
	}

	/**
	* 触发事件
	* @param {string} event 事件名称
	* @param  {...any} args 参数
	*/
	emit(event, ...args) {
		if (!this.events[event]) return;
		this.events[event].forEach(cb => cb(...args));
	}
}

// 单例模式导出，项目全局共享
const GlobalEventBus = new EventBus();
export default GlobalEventBus;

/**
 * 使用示例：
 * 
 * import EventBus from '@/utils/event_bus.js';
 * 
 * // 组件A监听
 * EventBus.on('vote-complete', (data) => {
 *   console.log('收到投票完成', data);
 * });
 * 
 * // 组件B触发
 * EventBus.emit('vote-complete', { id: 123 });
 */


