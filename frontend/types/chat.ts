/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Type Definitions for Chat & Message Data
 * ═══════════════════════════════════════════════════════════════════════════════
 * Use these types in your frontend for type-safe chat operations
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * PARTICIPANT & USER TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ChatParticipant {
    user: string; // ObjectId
    role: 'admin' | 'moderator' | 'member';
    joinedAt: Date;
    lastReadMsgId: string | null; // ObjectId
}

export interface UserRef {
    _id: string;
    name?: string;
    avatar?: string;
    email?: string;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MEDIA & ATTACHMENT TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface MediaAttachment {
    public_id: string;
    secure_url: string;
    resource_type: 'image' | 'video' | 'raw' | 'auto';
    format?: string;
    size?: number;
    original_name?: string;
}

export interface GroupAvatar extends MediaAttachment {
    version?: number;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * MESSAGE TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type MessageType = 'text' | 'image' | 'video' | 'file' | 'audio';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageReadReceipt {
    user: string; // ObjectId
    readAt: Date;
}

export interface MessageQuotePreview {
    bodyText: string;
    msgType: MessageType;
    sender: string; // ObjectId
}

export interface QuotedMessage extends MessageQuotePreview {
    _id: string; // ObjectId
}

export interface Message {
    _id: string;
    chat: string; // ObjectId (Chat)
    sender: string; // ObjectId (User)
    receiver?: string | null; // ObjectId (User) - for direct chats
    bodyText: string;
    msgType: MessageType;
    attachments: MediaAttachment[];
    readBy: MessageReadReceipt[];
    deliveredTo: string[]; // ObjectIds
    isDeleted: boolean;
    deletedFor: string[]; // ObjectIds
    replyTo: string | null; // ObjectId (Message)
    replyPreview: MessageQuotePreview | null;
    quotedMsgId: string | null; // ObjectId (Message)
    quotedMessage: QuotedMessage | null;
    status: MessageStatus;
    editedAt: Date | null;
    unsentAt: Date | null;
    unsentBy: string | null; // ObjectId (User)
    encryptedBody: string | null;
    nonce: string | null;
    createdAt: Date;
    updatedAt: Date;
    __v: number;
}

export interface MessageWithSender extends Message {
    senderDetails?: UserRef;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CHAT TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ConversationType = 'direct' | 'group';

export interface LastMessagePreview {
    text: string;
    sender: string; // ObjectId
    msgType: MessageType;
    createdAt: Date;
}

export interface Chat {
    _id: string;
    convoType: ConversationType;
    participants: ChatParticipant[];
    groupName: string; // Empty string for direct chats
    groupAvatar: GroupAvatar | null;
    lastMessage: LastMessagePreview | null;
    lastActivityTimestamp: Date;
    createdAt: Date;
    updatedAt: Date;
    __v: number;
}

export interface ChatWithDetails extends Chat {
    participantDetails?: UserRef[];
    senderDetails?: UserRef;
    unreadCount?: number;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * API REQUEST/RESPONSE TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ChatListResponse {
    success: boolean;
    data: Chat[];
    totalCount?: number;
    page?: number;
    limit?: number;
}

export interface ChatDetailResponse {
    success: boolean;
    data: Chat;
}

export interface MessageListResponse {
    success: boolean;
    data: Message[];
    totalCount?: number;
    page?: number;
    limit?: number;
}

export interface SendMessageRequest {
    bodyText?: string;
    msgType: MessageType;
    attachments?: MediaAttachment[];
    replyTo?: string; // ObjectId
    quotedMsgId?: string; // ObjectId
    receiver?: string; // ObjectId - for direct chats
    encryptedBody?: string;
    nonce?: string;
}

export interface SendMessageResponse {
    success: boolean;
    data: Message;
}

export interface UpdateMessageRequest {
    bodyText?: string;
    attachments?: MediaAttachment[];
}

export interface CreateChatRequest {
    convoType: ConversationType;
    participantIds: string[]; // ObjectIds
    groupName?: string; // Required for group chats
    groupAvatar?: GroupAvatar;
}

export interface CreateChatResponse {
    success: boolean;
    data: Chat;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * VALIDATION & ERROR TYPES
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface ValidationResult {
    isValid: boolean;
    errors: string[];
}

export interface ApiError {
    success: false;
    message: string;
    code?: string;
    details?: any;
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * HELPER TYPE GUARDS
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Type guard to check if chat is a direct chat
 */
export function isDirectChat(chat: Chat): boolean {
    return chat.convoType === 'direct';
}

/**
 * Type guard to check if chat is a group chat
 */
export function isGroupChat(chat: Chat): boolean {
    return chat.convoType === 'group';
}

/**
 * Type guard to check if message has attachments
 */
export function hasAttachments(message: Message): boolean {
    return message.attachments && message.attachments.length > 0;
}

/**
 * Type guard to check if message is a reply
 */
export function isReplyMessage(message: Message): boolean {
    return message.replyTo !== null && message.replyTo !== undefined;
}

/**
 * Type guard to check if message is quoted
 */
export function isQuotedMessage(message: Message): boolean {
    return message.quotedMsgId !== null && message.quotedMsgId !== undefined;
}

/**
 * Type guard to check if message is read
 */
export function isMessageRead(message: Message): boolean {
    return message.status === 'read';
}

/**
 * Type guard to check if message is deleted
 */
export function isMessageDeleted(message: Message): boolean {
    return message.isDeleted === true;
}

/**
 * Type guard to check if message is encrypted
 */
export function isEncryptedMessage(message: Message): boolean {
    return message.encryptedBody !== null && message.encryptedBody !== undefined;
}

/**
 * Get unread message count for user
 */
export function getUnreadCount(messages: Message[], userId: string): number {
    return messages.filter((msg) => {
        const isRead = msg.readBy.some((rb) => rb.user === userId);
        return !isRead && msg.sender !== userId;
    }).length;
}

/**
 * Check if user has read a message
 */
export function hasUserRead(message: Message, userId: string): boolean {
    return message.readBy.some((rb) => rb.user === userId);
}

/**
 * Check if user is admin in chat
 */
export function isUserAdmin(chat: Chat, userId: string): boolean {
    return chat.participants.some((p) => p.user === userId && p.role === 'admin');
}

/**
 * Check if user is in chat
 */
export function isUserInChat(chat: Chat, userId: string): boolean {
    return chat.participants.some((p) => p.user === userId);
}

/**
 * Get other participant in direct chat
 */
export function getOtherParticipant(chat: Chat, userId: string): ChatParticipant | undefined {
    if (!isDirectChat(chat) || chat.participants.length !== 2) {
        return undefined;
    }
    return chat.participants.find((p) => p.user !== userId);
}
