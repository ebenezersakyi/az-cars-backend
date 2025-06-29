const Notification = require('../models/Notification');
const Auction = require('../models/Auction');
const Bid = require('../models/Bid');
const User = require('../models/User');
const { sendPushNotificationToAuctionBidders } = require('./pushNotificationService');

/**
 * Create a notification for a user
 * @param {Object} notificationData - The notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (notificationData) => {
  try {
    const notification = await Notification.create(notificationData);
    
    // Emit real-time notification if socket.io is available
    if (global.io) {
      global.io.to(`user-${notificationData.user}`).emit('new-notification', notification);
    }
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Create notification when a new bid is placed
 * @param {Object} bid - The bid object
 * @param {Object} auction - The auction object
 */
const createBidPlacedNotification = async (bid, auction) => {
  try {
    // Get car details for better description
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    await createNotification({
      user: bid.bidder,
      type: 'bid_placed',
      title: 'Bid Placed Successfully',
      description: `Your bid of AED ${bid.amount.toLocaleString()} has been placed on ${auction.auctionTitle}`,
      auction: auction._id,
      bid: bid._id,
      metadata: {
        bidAmount: bid.amount,
        auctionTitle: auction.auctionTitle,
        carDetails: carDetails
      }
    });
  } catch (error) {
    console.error('Error creating bid placed notification:', error);
  }
};

/**
 * Create notifications when users are outbid
 * @param {Object} newBid - The new bid object
 * @param {Object} auction - The auction object
 */
const createOutbidNotifications = async (newBid, auction) => {
  try {
    // Find all users who have bid on this auction (except the new bidder)
    const previousBids = await Bid.find({
      auction: auction._id,
      bidder: { $ne: newBid.bidder }
    }).populate('bidder', 'firstName lastName');

    // Get unique bidders
    const uniqueBidders = [...new Map(previousBids.map(bid => [bid.bidder._id.toString(), bid.bidder])).values()];

    // Get car details
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    // Create outbid notifications for each unique bidder
    const notificationPromises = uniqueBidders.map(bidder => 
      createNotification({
        user: bidder._id,
        type: 'outbid',
        title: 'You\'ve Been Outbid!',
        description: `Someone placed a higher bid of AED ${newBid.amount.toLocaleString()} on ${auction.auctionTitle}`,
        auction: auction._id,
        bid: newBid._id,
        metadata: {
          bidAmount: newBid.amount,
          auctionTitle: auction.auctionTitle,
          carDetails: carDetails
        }
      })
    );

    await Promise.all(notificationPromises);

    // Send push notifications to all other bidders
    try {
      await sendPushNotificationToAuctionBidders(
        auction._id,
        newBid.bidder,
        {
          title: 'New Bid Alert!',
          body: `Someone placed a bid of AED ${newBid.amount.toLocaleString()} on ${auction.auctionTitle}`,
          data: {
            type: 'new_bid',
            auctionId: auction._id.toString(),
            bidId: newBid._id.toString(),
            bidAmount: newBid.amount,
            auctionTitle: auction.auctionTitle,
            carDetails: carDetails
          }
        }
      );
    } catch (pushError) {
      console.error('Error sending push notifications for new bid:', pushError);
      // Don't fail the notification creation if push notifications fail
    }
  } catch (error) {
    console.error('Error creating outbid notifications:', error);
  }
};

/**
 * Create notification when user wins an auction
 * @param {Object} auction - The auction object
 * @param {Object} winningBid - The winning bid object
 */
const createAuctionWonNotification = async (auction, winningBid) => {
  try {
    // Get car details
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    await createNotification({
      user: auction.winner,
      type: 'auction_won',
      title: 'Congratulations! You Won!',
      description: `You won the auction for ${auction.auctionTitle} with a bid of AED ${winningBid.amount.toLocaleString()}`,
      auction: auction._id,
      bid: winningBid._id,
      metadata: {
        bidAmount: winningBid.amount,
        auctionTitle: auction.auctionTitle,
        carDetails: carDetails
      }
    });
  } catch (error) {
    console.error('Error creating auction won notification:', error);
  }
};

/**
 * Create notifications for users who lost an auction
 * @param {Object} auction - The auction object
 * @param {Object} winningBid - The winning bid object
 */
const createAuctionLostNotifications = async (auction, winningBid) => {
  try {
    // Find all users who bid on this auction but didn't win
    const losingBids = await Bid.find({
      auction: auction._id,
      bidder: { $ne: auction.winner }
    }).populate('bidder', 'firstName lastName');

    // Get unique losing bidders
    const uniqueLosingBidders = [...new Map(losingBids.map(bid => [bid.bidder._id.toString(), bid.bidder])).values()];

    // Get car details
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    // Create auction lost notifications
    const notificationPromises = uniqueLosingBidders.map(bidder => 
      createNotification({
        user: bidder._id,
        type: 'auction_lost',
        title: 'Auction Ended',
        description: `The auction for ${auction.auctionTitle} has ended. The winning bid was AED ${winningBid.amount.toLocaleString()}`,
        auction: auction._id,
        bid: winningBid._id,
        metadata: {
          bidAmount: winningBid.amount,
          auctionTitle: auction.auctionTitle,
          carDetails: carDetails
        }
      })
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error('Error creating auction lost notifications:', error);
  }
};

/**
 * Create notifications for auction ending soon
 * @param {Object} auction - The auction object
 */
const createAuctionEndingSoonNotifications = async (auction) => {
  try {
    // Find all users who have bid on this auction
    const bids = await Bid.find({ auction: auction._id }).populate('bidder', 'firstName lastName');
    
    // Get unique bidders
    const uniqueBidders = [...new Map(bids.map(bid => [bid.bidder._id.toString(), bid.bidder])).values()];

    // Get car details
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    // Calculate time remaining
    const timeRemaining = Math.ceil((auction.endTime - new Date()) / (1000 * 60)); // minutes

    // Create ending soon notifications
    const notificationPromises = uniqueBidders.map(bidder => 
      createNotification({
        user: bidder._id,
        type: 'auction_ending_soon',
        title: 'Auction Ending Soon!',
        description: `The auction for ${auction.auctionTitle} ends in ${timeRemaining} minutes. Current highest bid: AED ${auction.currentHighestBid.toLocaleString()}`,
        auction: auction._id,
        metadata: {
          bidAmount: auction.currentHighestBid,
          auctionTitle: auction.auctionTitle,
          carDetails: carDetails
        }
      })
    );

    await Promise.all(notificationPromises);
  } catch (error) {
    console.error('Error creating auction ending soon notifications:', error);
  }
};

/**
 * Create notification for auction creator when new bid is placed
 * @param {Object} bid - The bid object
 * @param {Object} auction - The auction object
 */
const createNewBidOnAuctionNotification = async (bid, auction) => {
  try {
    // Don't notify if the auction creator is the bidder
    if (auction.createdBy.toString() === bid.bidder.toString()) {
      return;
    }

    // Get car details
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    });

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;

    await createNotification({
      user: auction.createdBy,
      type: 'new_bid_on_auction',
      title: 'New Bid on Your Auction',
      description: `Someone placed a bid of AED ${bid.amount.toLocaleString()} on your auction: ${auction.auctionTitle}`,
      auction: auction._id,
      bid: bid._id,
      metadata: {
        bidAmount: bid.amount,
        auctionTitle: auction.auctionTitle,
        carDetails: carDetails
      }
    });
  } catch (error) {
    console.error('Error creating new bid on auction notification:', error);
  }
};

/**
 * Create notifications for new auction creation and send push notifications to all users
 * @param {Object} auction - The newly created auction object
 */
const createNewAuctionNotifications = async (auction) => {
  try {
    // Get auction with car details populated
    const populatedAuction = await Auction.findById(auction._id).populate({
      path: 'car',
      populate: [
        { path: 'make', select: 'name' },
        { path: 'model', select: 'name' }
      ]
    }).populate('createdBy', 'firstName lastName');

    const carDetails = `${populatedAuction.car.make.name} ${populatedAuction.car.model.name}`;
    const creatorName = `${populatedAuction.createdBy.firstName} ${populatedAuction.createdBy.lastName}`;

    // Get all users who have notification tokens (excluding the auction creator)
    const usersWithTokens = await User.find({
      _id: { $ne: auction.createdBy }, // Exclude auction creator
      notificationToken: { $exists: true, $ne: null }
    }).select('_id firstName lastName notificationToken');

    if (usersWithTokens.length === 0) {
      console.log('No users with notification tokens found for new auction notification');
      return;
    }

    console.log(`Creating new auction notifications for ${usersWithTokens.length} users`);

    // Create in-app notifications for all users
    const notificationPromises = usersWithTokens.map(user => 
      createNotification({
        user: user._id,
        type: 'new_auction_created',
        title: 'New Auction Available!',
        description: `A new auction for ${auction.auctionTitle} (${carDetails}) has started. Starting price: AED ${auction.startingPrice.toLocaleString()}`,
        auction: auction._id,
        metadata: {
          auctionTitle: auction.auctionTitle,
          carDetails: carDetails,
          startingPrice: auction.startingPrice,
          creatorName: creatorName
        }
      })
    );

    await Promise.all(notificationPromises);

    // Send push notifications in the background
    setImmediate(async () => {
      try {
        console.log(`🚀 Initiating push notifications for new auction ${auction._id} to ${usersWithTokens.length} users`);
        const { sendPushNotificationToUsersForNewAuction } = require('./pushNotificationService');
        const results = await sendPushNotificationToUsersForNewAuction(auction, populatedAuction, carDetails, usersWithTokens);
        console.log(`📊 Push notification results for auction ${auction._id}:`, {
          total: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        });
      } catch (pushError) {
        console.error('❌ Error sending push notifications for new auction:', pushError);
        console.error('Push notification error details:', pushError.stack);
      }
    });

  } catch (error) {
    console.error('Error creating new auction notifications:', error);
  }
};

module.exports = {
  createNotification,
  createBidPlacedNotification,
  createOutbidNotifications,
  createAuctionWonNotification,
  createAuctionLostNotifications,
  createAuctionEndingSoonNotifications,
  createNewBidOnAuctionNotification,
  createNewAuctionNotifications
}; 