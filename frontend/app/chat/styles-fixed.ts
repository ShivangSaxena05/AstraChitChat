import { StyleSheet } from 'react-native';

const chatDetailStyles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#151718' 
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    backgroundColor: '#1a1a1a',
    minHeight: 60,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  headerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  partnerName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
    marginRight: 6,
  },
  lastSeen: {
    color: '#8E8E93',
    fontSize: 13,
  },
  typingText: {
    color: '#4ADDAE',
    fontSize: 13,
    marginLeft: 6,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  messagesList: { flex: 1 },
  messagesContainer: { padding: 16, paddingTop: 8 },
  dateSeparator: { 
    alignItems: 'center', 
    marginVertical: 12 
  },
  dateSeparatorText: {
    backgroundColor: '#2b2b2b',
    color: '#aaa',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    fontSize: 12,
    overflow: 'hidden',
  },
  messageContainer: {
    maxWidth: '85%',
    marginBottom: 8,
    padding: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 1,
  },
  ownMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#005c4b',
    borderBottomRightRadius: 4,
  },
  otherMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#202c33',
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 15, lineHeight: 20 },
  ownMessageText: { color: '#e9edef' },
  otherMessageText: { color: '#e9edef' },
  senderNameText: { 
    color: '#4ADDAE', 
    fontSize: 12, 
    fontWeight: 'bold', 
    marginBottom: 4 
  },
  timestamp: { fontSize: 12, marginTop: 4 },
  ownTimestamp: { color: '#e0e0e0', textAlign: 'right' },
  otherTimestamp: { color: '#aaa' },
  timestampContainer: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  readStatus: { fontSize: 12, marginLeft: 8 },
  readStatusBlue: { color: '#34B7F1' },
  readStatusGray: { color: '#e0e0e0' },
  editedText: { fontSize: 12, marginTop: 2 },
  ownEditedText: { color: '#e0e0e0' },
  otherEditedText: { color: '#999' },
  inputContainer: { 
    flexDirection: 'row', 
    padding: 8, 
    paddingHorizontal: 16, 
    borderTopWidth: 1, 
    borderTopColor: '#202c33', 
    backgroundColor: '#1f2c34', 
    alignItems: 'flex-end' 
  },
  inputContainerWithReply: { 
    flexDirection: 'column', 
    padding: 8, 
    paddingHorizontal: 16, 
    borderTopWidth: 1, 
    borderTopColor: '#202c33', 
    backgroundColor: '#1f2c34', 
    alignItems: 'stretch' 
  },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    marginRight: 8,
    maxHeight: 120,
    color: '#e9edef',
    backgroundColor: '#2a3942',
    fontSize: 16,
  },
  sendButton: {
    backgroundColor: '#00a884',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  sendButtonDisabled: { backgroundColor: '#3b4a54' },
  sendButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  sendButtonTextDisabled: { color: '#8b9a9f' },
  callHoverContainer: { 
    position: 'absolute', 
    top: 100, 
    left: 0, 
    right: 0, 
    alignItems: 'center', 
    zIndex: 100, 
    pointerEvents: 'none' 
  },
  callIconWrapper: { 
    width: 80, 
    height: 80, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    borderRadius: 40 
  },
  circularProgress: { position: 'absolute' },
  callHoverText: { 
    color: '#fff', 
    marginTop: 12, 
    fontWeight: 'bold', 
    fontSize: 14, 
    backgroundColor: 'rgba(0,0,0,0.6)', 
    paddingHorizontal: 16, 
    paddingVertical: 4, 
    borderRadius: 12, 
    overflow: 'hidden' 
  },
  loadingMoreContainer: { padding: 12, alignItems: 'center' },
  loadingMoreText: { color: '#8E8E93', fontSize: 12 },
  replyPreviewContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#2a3942', 
    borderRadius: 8, 
    paddingVertical: 8, 
    paddingHorizontal: 12, 
    marginBottom: 8 
  },
  replyPreviewLine: { 
    width: 3, 
    height: '100%', 
    backgroundColor: '#4ADDAE', 
    borderRadius: 2, 
    marginRight: 12 
  },
  replyPreviewContent: { flex: 1 },
  replyPreviewName: { 
    color: '#4ADDAE', 
    fontSize: 12, 
    fontWeight: 'bold', 
    marginBottom: 2 
  },
  replyPreviewText: { color: '#aaa', fontSize: 14 },
  cancelReplyButton: { padding: 4 },
  quotedMessageContainer: { 
    borderLeftWidth: 3, 
    paddingLeft: 8, 
    marginBottom: 6 
  },
  ownQuotedMessage: { borderLeftColor: '#4ADDAE' },
  otherQuotedMessage: { borderLeftColor: '#4ADDAE' },
  quotedMessageName: { 
    fontSize: 12, 
    fontWeight: 'bold', 
    marginBottom: 2 
  },
  ownQuotedName: { color: '#4ADDAE' },
  otherQuotedName: { color: '#4ADDAE' },
  quotedMessageText: { fontSize: 13 },
  ownQuotedText: { color: '#a8c7bb' },
  otherQuotedText: { color: '#aaa' },
});

export default chatDetailStyles;

export { chatDetailStyles };
