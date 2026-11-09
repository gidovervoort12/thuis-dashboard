FROM python:3.12-alpine
WORKDIR /app
COPY server.py ./
COPY www ./www
ENV DASH_DATA=/data
VOLUME /data
EXPOSE 8080
USER nobody
CMD ["python3", "-u", "server.py"]
