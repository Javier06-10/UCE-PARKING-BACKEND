import "dotenv/config";

const env = {
  port: process.env.PORT || 4000,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

   serialPort: process.env.SERIAL_PORT,
  serialBaudRate: Number(process.env.SERIAL_BAUDRATE) || 9600,
};

export default env;
