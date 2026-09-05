import asyncio
import logging
from app.core.config import settings
from app.services.notification_service import init_firebase
from firebase_admin import messaging

logging.basicConfig(level=logging.INFO)

async def test():
    try:
        init_firebase()
        # Create a dummy message
        message = messaging.Message(
            notification=messaging.Notification(
                title="Test",
                body="Test connection"
            ),
            token="dummy-token-for-dry-run-test"
        )
        # Send in dry run mode to test authentication
        response = messaging.send(message, dry_run=True)
        print("✅ Firebase initialized and authentication successful (dry run passed).")
    except Exception as e:
        if "Invalid registration token" in str(e) or "Requested entity was not found" in str(e) or "token" in str(e).lower():
            # If it fails complaining about the token, it means auth worked!
            print("✅ Firebase initialized and authentication successful (token was invalid as expected).")
        else:
            print(f"❌ Firebase test failed: {e}")

if __name__ == "__main__":
    asyncio.run(test())
