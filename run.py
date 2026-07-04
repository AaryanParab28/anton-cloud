from anton.config import HOST, PORT
from anton.interfaces.web.server import create_app

if __name__ == "__main__":
    app = create_app()
    app.run(host=HOST, port=PORT, debug=False)
