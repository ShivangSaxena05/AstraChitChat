async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;
    const userId = req.user._id.toString();

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: 'Message not found' });

    if (message.sender.toString() !== userId) return res.status(403).json({ message: 'Not authorized to delete this message' });

    // Delete media files
    const { deleteS3Object, deleteFromCloudinary, STORAGE_TYPE } = require('../services/mediaService');
    
    // Single media
    if (message.mediaKey) {
      try {
        if (STORAGE_TYPE === 'cloudinary') {
          const publicId = message.mediaUrl?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
          if (publicId) await deleteFromCloudinary(publicId);
        } else {
          await deleteS3Object(message.mediaKey);
        }
      } catch (err) {
        console.warn('Media delete failed:', err.message);
      }
    }
    
    // Multiple attachments
    for (const att of message.attachments || []) {
      try {
        if (STORAGE_TYPE === 'cloudinary') {
          const publicId = att.url?.split('/').slice(-2).join('/').replace(/\.[^/.]+$/, '');
          if (publicId) await deleteFromCloudinary(publicId);
        } else {
          await deleteS3Object(att.key);
        }
      } catch (err) {
        console.warn('Attachment delete failed:', err.message);
      }
    }
    
    // Delete message document
    await Message.deleteOne({ _id: messageId });
    
    // Update chat.lastMessage if needed
    const chat = await Chat.findById(message.chat);
    if (chat && chat.lastMessage && new Date(chat.lastMessage.createdAt).getTime() === new Date(message.createdAt).getTime()) {
      const prevMsg = await Message.findOne({ 
        chat: message.chat, 
        _id: { $ne: messageId },
        createdAt: { $lt: message.createdAt }
      }).sort({ createdAt: -1 }).select('bodyText attachments createdAt');
      
      chat.lastMessage = prevMsg ? {
        text: prevMsg.bodyText || (prevMsg.attachments?.length ? 'Attachment' : ''),
        createdAt: prevMsg.createdAt
      } : null;
      await chat.save();
    }
    
    return res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    console.error('deleteMessage error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
}

module.exports = {
  deleteMessage
};
