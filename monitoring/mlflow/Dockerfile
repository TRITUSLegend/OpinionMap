# ============================================
# AgentFlow AI - MLflow Tracking Server
# ============================================

FROM python:3.11-slim

# Install MLflow with required dependencies
RUN pip install --no-cache-dir \
    mlflow==2.17.0 \
    psycopg2-binary

# Create data directories
RUN mkdir -p /mlflow/mlartifacts /mlflow/db

WORKDIR /mlflow

# Create non-root user
RUN groupadd -r mlflow && useradd -r -g mlflow mlflow
RUN chown -R mlflow:mlflow /mlflow
USER mlflow

EXPOSE 5001

CMD ["mlflow", "server", \
     "--host", "0.0.0.0", \
     "--port", "5001", \
     "--backend-store-uri", "sqlite:///db/mlflow.db", \
     "--default-artifact-root", "./mlartifacts"]
