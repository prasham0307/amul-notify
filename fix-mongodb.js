const { MongoClient } = require('mongodb')

const uri =
  'mongodb+srv://itsprashamshah123_db_user:TVpZTKFhqJAPu7pC@amul.wt3417d.mongodb.net/?retryWrites=true&w=majority&appName=amul'

async function fixDatabase() {
  const client = new MongoClient(uri)

  try {
    await client.connect()
    console.log('Connected to MongoDB')

    const db = client.db('test')

    // Drop the products collection completely (removes data and indexes)
    try {
      await db.collection('products').drop()
      console.log('✅ Dropped products collection')
    } catch (err) {
      if (err.code === 26) {
        console.log('Products collection does not exist (this is fine)')
      } else {
        throw err
      }
    }

    // Also clear tracked_products to start fresh
    const tracked = await db.collection('tracked_products').deleteMany({})
    console.log(`✅ Cleared ${tracked.deletedCount} tracked products`)

    console.log('\n✅ Database cleaned successfully!')
    console.log('Now restart your bot with: pnpm run dev')
  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await client.close()
  }
}

fixDatabase()
