import { ChatService } from './services/jsonDb';
console.log('Testing DB...');
ChatService.saveMessage('test-chat', {
    id: 'msg-1',
    chatId: 'test-chat',
    fromMe: true,
    text: 'Hello DB',
    createdAt: Date.now()
});
console.log('Chats:', ChatService.getChats());
console.log('Messages:', ChatService.getMessages('test-chat'));
