/**
 * store 出口
 */
import { cartStore } from './cart'
import { userStore } from './user'

export { cartStore, userStore }

export default { cart: cartStore, user: userStore }
