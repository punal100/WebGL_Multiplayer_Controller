import { io } from 'socket.io-client';

// Connect to the same origin (works for both localhost and LAN IP)
export const socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });
