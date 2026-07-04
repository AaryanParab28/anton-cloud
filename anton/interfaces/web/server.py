from flask import Flask, jsonify, render_template, request

from anton.identity import NAME


def create_app() -> Flask:
    app = Flask(__name__)

    @app.route("/")
    def index():
        return render_template("index.html", name=NAME)

    @app.route("/chat", methods=["POST"])
    def chat():
        data = request.get_json(silent=True) or {}
        message: str = (data.get("message") or "").strip()
        if not message:
            return jsonify({"error": "empty message"}), 400
        reply = f"[echo] {message}"
        return jsonify({"reply": reply})

    return app
